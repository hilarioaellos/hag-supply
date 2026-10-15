import { Prisma, type Order, type OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { confirmOrder } from "@/lib/confirm-order";
import { handleOversell, type OversellResult } from "@/lib/oversell";
import { sendOrderConfirmation } from "@/lib/order-emails";
import { generateOrderNumber } from "@/lib/order-number";

// Flujo de checkout (plan MVP, sección C). Toda la lógica vive aquí; app/api/checkout/route.ts solo
// autentica, valida la entrada y traduce el resultado a HTTP.

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export type ShippingAddress = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
};

export type ShippingErrors = Partial<Record<keyof ShippingAddress, string>>;

export function validateShipping(input: unknown): { ok: true; value: ShippingAddress } | { ok: false; errors: ShippingErrors } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const value: ShippingAddress = {
    name: str("name"),
    line1: str("line1"),
    line2: str("line2") || null,
    city: str("city"),
    state: str("state").toUpperCase(),
    zip: str("zip"),
  };
  const errors: ShippingErrors = {};
  if (value.name.length < 2 || value.name.length > 100) errors.name = "Enter your full name.";
  if (value.line1.length < 3 || value.line1.length > 200) errors.line1 = "Enter a street address.";
  if (value.line2 && value.line2.length > 200) errors.line2 = "Address line 2 is too long.";
  if (value.city.length < 2 || value.city.length > 100) errors.city = "Enter a city.";
  if (!US_STATES[value.state]) errors.state = "Select a state.";
  if (!/^\d{5}(-\d{4})?$/.test(value.zip)) errors.zip = "Enter a valid ZIP code (12345 or 12345-6789).";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export type CheckoutResult =
  | { kind: "payment"; orderId: string; orderNumber: string; clientSecret: string; total: string }
  | { kind: "paid"; orderId: string }
  | { kind: "error"; status: number; message: string };

const fail = (status: number, message: string): CheckoutResult => ({ kind: "error", status, message });

// PaymentIntents que todavía se pueden cancelar sin riesgo de cobro.
const CANCELABLE = new Set(["requires_payment_method", "requires_confirmation", "requires_action", "canceled"]);

// Una orden sin PaymentIntent más joven que esto puede ser de otra solicitud que todavía espera a Stripe
// (el SDK reintenta y corta a los 80 s): no se cancela, se responde 409. Más vieja = abandonada (caso C).
const PAYMENT_INTENT_CREATION_GRACE_MS = 2 * 60 * 1000;

// Estados en los que la orden quedó pagada y confirmada.
const PAID_STATUSES = new Set<OrderStatus>(["PAYMENT_CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]);

type StripeClient = typeof stripe;

// `client` permite que las pruebas intercepten llamadas a Stripe (p. ej. pausar la creación del PaymentIntent).
export async function startCheckout(
  userId: string,
  shipping: ShippingAddress,
  client: StripeClient = stripe
): Promise<CheckoutResult> {
  // 5. Orden PENDING_PAYMENT previa (casos B, C y D). Va antes de validar el carrito: si esa orden ya se
  // pagó hay que reconciliarla aunque el carrito o el stock hayan cambiado desde entonces.
  const pending = await db.order.findFirst({ where: { userId, status: "PENDING_PAYMENT" } });
  if (pending) {
    const resolved = await resolvePendingOrder(pending.id, client);
    if (resolved) return resolved;
  }

  // 1-2. Carrito no vacío.
  const cart = await db.cartItem.findMany({
    where: { userId },
    include: { product: { select: { id: true, name: true, sku: true, price: true, stock: true, deletedAt: true } } },
    orderBy: { addedAt: "asc" },
  });
  if (cart.length === 0) return fail(400, "Your cart is empty.");

  // 3-4. Total server-side y hard check de stock por item.
  for (const item of cart) {
    if (item.product.deletedAt) return fail(409, `${item.product.name} is no longer available. Remove it from your cart.`);
    if (item.product.stock < item.quantity) {
      return fail(409, `Only ${item.product.stock} of ${item.product.name} left. Update your cart and try again.`);
    }
  }
  const subtotal = cart.reduce((sum, i) => sum.add(i.product.price.mul(i.quantity)), new Prisma.Decimal(0));
  const total = subtotal; // Envío $0 e impuestos excluidos en el MVP (plan, sección H).

  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } });

  // 6. Nueva orden PENDING_PAYMENT (número único: hasta 3 intentos ante colisión).
  let order: Order | null = null;
  for (let attempt = 0; attempt < 3 && !order; attempt++) {
    try {
      order = await db.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId,
          buyerEmail: user.email,
          buyerName: user.name,
          subtotal,
          shippingCost: 0,
          total,
          shippingName: shipping.name,
          shippingLine1: shipping.line1,
          shippingLine2: shipping.line2,
          shippingCity: shipping.city,
          shippingState: shipping.state,
          shippingZip: shipping.zip,
          shippingCountry: "US",
          items: {
            create: cart.map((i) => ({
              productId: i.product.id,
              productName: i.product.name,
              productSku: i.product.sku,
              quantity: i.quantity,
              unitPrice: i.product.price,
              total: i.product.price.mul(i.quantity),
            })),
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = String(error.meta?.target ?? "");
        if (target.includes("orderNumber")) continue;
        // Índice one_pending_per_user: otro checkout del mismo usuario creó su orden en paralelo.
        return fail(409, "Another checkout is already in progress. Please try again.");
      }
      throw error;
    }
  }
  if (!order) throw new Error("No se pudo generar un número de orden único tras 3 intentos.");

  // 7-8. PaymentIntent. Si Stripe falla, la orden se cancela antes de responder.
  let paymentIntent: Awaited<ReturnType<StripeClient["paymentIntents"]["create"]>>;
  try {
    paymentIntent = await client.paymentIntents.create(
      {
        amount: Number(total.mul(100).toFixed(0)),
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        receipt_email: user.email,
        metadata: { orderId: order.id, orderNumber: order.orderNumber, userId },
      },
      { idempotencyKey: `pi-${order.id}` }
    );
    if (!paymentIntent.client_secret) throw new Error("PaymentIntent sin client_secret");
  } catch (error) {
    console.error(`[checkout] PaymentIntent falló para la orden ${order.id}:`, error instanceof Error ? error.message : error);
    await db.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT", stripePaymentIntentId: null },
      data: { status: "CANCELLED" },
    });
    return fail(500, "We couldn't start the payment. Please try again.");
  }

  // La asociación solo vale si la orden sigue PENDING_PAYMENT y sin PaymentIntent: si otra solicitud la
  // canceló mientras se esperaba a Stripe, este PaymentIntent se cancela y su clientSecret NUNCA se devuelve.
  const attached = await db.order.updateMany({
    where: { id: order.id, status: "PENDING_PAYMENT", stripePaymentIntentId: null },
    data: { stripePaymentIntentId: paymentIntent.id },
  });
  if (attached.count !== 1) {
    try {
      await client.paymentIntents.cancel(paymentIntent.id);
    } catch (error) {
      // Sin clientSecret entregado nadie puede pagarlo; se registra para revisión.
      console.error(`[checkout] no se pudo cancelar el PaymentIntent huérfano ${paymentIntent.id}:`, error instanceof Error ? error.message : error);
    }
    return fail(409, "Your checkout changed while we were preparing the payment. Please try again.");
  }

  // 9. clientSecret al frontend.
  return {
    kind: "payment",
    orderId: order.id,
    orderNumber: order.orderNumber,
    clientSecret: paymentIntent.client_secret!,
    total: total.toFixed(2),
  };
}

// Resuelve la orden PENDING_PAYMENT previa. Devuelve null si se puede crear una nueva (la previa quedó
// CANCELLED o ya no está pendiente), o un resultado final (ya pagada, en creación, en proceso, oversell).
async function resolvePendingOrder(orderId: string, client: StripeClient): Promise<CheckoutResult | null> {
  // Se relee en cada vuelta: otra solicitud puede haber asociado el PaymentIntent o cambiado el estado.
  for (let attempt = 0; attempt < 3; attempt++) {
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    // Otro actor la resolvió después del findFirst (p. ej. el webhook la confirmó y vació el carrito):
    // se responde según su estado real en lugar de seguir como si no existiera.
    if (order.status !== "PENDING_PAYMENT") return outcomeForStatus(order.id, { paid: false });

    if (!order.stripePaymentIntentId) {
      // Otra solicitud la creó hace poco y puede estar esperando a Stripe: no se toca.
      if (Date.now() - order.createdAt.getTime() < PAYMENT_INTENT_CREATION_GRACE_MS) {
        return fail(409, "Your checkout is being prepared. Please try again in a moment.");
      }
      // CASO C: abandonada sin PaymentIntent. Condicionado a que siga sin PaymentIntent.
      const cancelled = await db.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT", stripePaymentIntentId: null },
        data: { status: "CANCELLED" },
      });
      if (cancelled.count === 1) return null;
      continue; // cambió entre la lectura y la escritura: se reevalúa
    }

    return resolveWithPaymentIntent(order, client);
  }
  return fail(409, "Your previous checkout is changing. Please try again in a moment.");
}

// CASOS B y D (D = expirada por TTL de 30 min: se aplica la misma lógica antes de cancelar).
async function resolveWithPaymentIntent(order: Order, client: StripeClient): Promise<CheckoutResult | null> {
  let paymentIntent = await client.paymentIntents.retrieve(order.stripePaymentIntentId!);

  if (CANCELABLE.has(paymentIntent.status)) {
    // Primero se cancela en Stripe y solo después la orden local: si se invirtiera el orden, el cliente
    // podría terminar de pagar un PaymentIntent cuya orden ya está CANCELLED (cobro sin orden).
    if (paymentIntent.status !== "canceled") {
      try {
        paymentIntent = await client.paymentIntents.cancel(paymentIntent.id);
      } catch {
        // El estado cambió entre retrieve y cancel (p. ej. el pago se completó): se reevalúa abajo.
        paymentIntent = await client.paymentIntents.retrieve(paymentIntent.id);
      }
    }
    if (paymentIntent.status === "canceled") {
      const cancelled = await db.order.updateMany({
        where: { id: order.id, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED" },
      });
      if (cancelled.count === 1) return null;
      return outcomeForStatus(order.id, { paid: false });
    }
  }

  if (paymentIntent.status === "succeeded") {
    // El pago ya se cobró: no se cancela, se confirma con la misma función que el webhook.
    const result = await confirmOrder(order.id);
    if (result === "confirmed") {
      await sendOrderConfirmation(order.id);
      return { kind: "paid", orderId: order.id };
    }
    if (result === "already_processed") return outcomeForStatus(order.id, { paid: true });
    const refund = await handleOversell(order.id, client);
    return oversellFailure(refund);
  }

  if (paymentIntent.status === "processing" || paymentIntent.status === "requires_capture") {
    return fail(409, "A payment is already being processed. Please wait a moment.");
  }

  // Cualquier otro estado inesperado: no se toca nada.
  console.error(`[checkout] PaymentIntent ${paymentIntent.id} en estado inesperado ${paymentIntent.status}`);
  return fail(409, "We couldn't resume your previous checkout. Please try again in a moment.");
}

// Tras perder una carrera (confirmOrder → already_processed, o cancelación condicionada que no aplicó) se
// relee el estado real: solo los estados de compra confirmada redirigen a la confirmación.
async function outcomeForStatus(orderId: string, { paid }: { paid: boolean }): Promise<CheckoutResult | null> {
  const { status } = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  if (PAID_STATUSES.has(status)) return { kind: "paid", orderId };
  if (status === "OVERSELL_REFUND_PENDING" || status === "CANCELLED_REFUNDED") {
    return fail(409, "The item became unavailable and your payment is being refunded.");
  }
  if (status === "OVERSELL_REFUND_FAILED") return oversellFailure("OVERSELL_REFUND_FAILED");
  if (status === "PENDING_PAYMENT") return fail(409, "Your previous checkout is changing. Please try again in a moment.");
  // CANCELLED: si el pago NO estaba cobrado, se puede iniciar otra orden; si estaba cobrado, es una
  // inconsistencia (pago sobre orden cancelada) que debe revisar una persona.
  if (!paid) return null;
  console.error(`[checkout] pago cobrado sobre la orden ${orderId} en estado ${status}: requiere revisión`);
  return fail(409, "We couldn't confirm your order automatically. Our team has been notified and will contact you.");
}

function oversellFailure(refund: OversellResult): CheckoutResult {
  if (refund === "OVERSELL_REFUND_FAILED") {
    return fail(409, "The item became unavailable. We couldn't refund your payment automatically; our team has been notified and will refund you.");
  }
  return fail(409, "The item became unavailable and your payment is being refunded.");
}

export type PaymentReconciliation = { status: OrderStatus; paymentIntentStatus: string | null };

// Reconcile al volver de Stripe (/order-confirmation/[id]). Mientras no exista el webhook (HAG-95) es lo que
// confirma la orden; después queda como respaldo idempotente. A diferencia de startCheckout, NUNCA cancela:
// el cliente puede estar a mitad de una autenticación (3DS) o de un pago en proceso.
export async function reconcileOrderPayment(orderId: string, client: StripeClient = stripe): Promise<PaymentReconciliation> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, stripePaymentIntentId: true },
  });

  // Reembolso por oversell sin concluir (refund pending o error transitorio en un intento anterior): se
  // retoma con el mismo flujo, que reutiliza el stripeRefundId guardado y no duplica el refund.
  if (order.status === "OVERSELL_REFUND_PENDING") {
    try {
      await handleOversell(orderId, client);
    } catch (error) {
      console.error(`[checkout] reintento de refund de la orden ${orderId} falló:`, error instanceof Error ? error.message : error);
    }
    const { status } = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    return { status, paymentIntentStatus: null };
  }

  if (order.status !== "PENDING_PAYMENT" || !order.stripePaymentIntentId) {
    return { status: order.status, paymentIntentStatus: null };
  }

  let paymentIntentStatus: string | null = null;
  try {
    const paymentIntent = await client.paymentIntents.retrieve(order.stripePaymentIntentId);
    paymentIntentStatus = paymentIntent.status;
    if (paymentIntent.status === "succeeded") {
      const result = await confirmOrder(orderId);
      if (result === "confirmed") await sendOrderConfirmation(orderId);
      if (result === "oversell") await handleOversell(orderId, client);
    }
  } catch (error) {
    // Stripe no responde: se muestra el estado actual y el cliente puede recargar.
    console.error(`[checkout] reconcile de la orden ${orderId} falló:`, error instanceof Error ? error.message : error);
  }

  const { status } = await db.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  return { status, paymentIntentStatus };
}
