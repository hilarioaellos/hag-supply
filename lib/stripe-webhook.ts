import type Stripe from "stripe";
import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { confirmOrder } from "@/lib/confirm-order";
import { applyRefundOutcome, handleOversell } from "@/lib/oversell";
import { notifyAdmin, sendOrderConfirmation } from "@/lib/order-emails";
import { appOrigin } from "@/lib/app-origin";

// Lógica del webhook de Stripe (plan MVP, sección D). app/api/webhooks/stripe/route.ts verifica la firma y
// traduce el resultado: si esta función lanza, la ruta responde 5xx y Stripe reenvía el evento.
// Idempotente: Stripe puede repetir eventos o entregarlos fuera de orden; cada paso está condicionado al
// estado actual de la orden.

type StripeClient = typeof stripe;

export type WebhookOutcome = { action: string; orderId?: string };

// Estados terminales para payment_intent.succeeded (plan, sección D paso 4).
const TERMINAL = new Set<OrderStatus>([
  "PAYMENT_CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "CANCELLED_REFUNDED",
  "OVERSELL_REFUND_FAILED",
]);

export async function handleStripeEvent(event: Stripe.Event, client: StripeClient = stripe): Promise<WebhookOutcome> {
  switch (event.type) {
    case "payment_intent.succeeded":
      return onPaymentSucceeded(event.data.object, event.livemode, client);
    case "refund.updated":
    case "refund.failed":
      return onRefundChanged(event.data.object, client);
    default:
      return { action: `ignored:${event.type}` };
  }
}

async function onPaymentSucceeded(paymentIntent: Stripe.PaymentIntent, livemode: boolean, client: StripeClient): Promise<WebhookOutcome> {
  const order = await db.order.findUnique({
    where: { stripePaymentIntentId: paymentIntent.id },
    select: { id: true, status: true },
  });

  if (!order) {
    const orderId = paymentIntent.metadata?.orderId;
    // HAG-124: la cuenta de Stripe de PRUEBA es compartida. Un pago de prueba creado por OTRA instalación
    // (p. ej. las pruebas locales) no tiene orden aquí y no es un incidente de esta tienda: se ignora sin avisar.
    // HAG-125: solo en modo test. En live un pago cobrado sin orden siempre avisa, aunque traiga otra marca.
    const origin = paymentIntent.metadata?.origin;
    if (!livemode && origin && origin !== appOrigin()) {
      console.info(`[stripe-webhook] PaymentIntent ${paymentIntent.id} de otro origen (${origin}); ignorado`);
      return { action: "ignored:foreign_origin" };
    }
    // Un pago cobrado sin orden asociada no debería existir: el checkout solo entrega el clientSecret de
    // PaymentIntents ya asociados. Si aparece, lo revisa una persona (no se reembolsa a ciegas).
    console.error(`[stripe-webhook] PaymentIntent ${paymentIntent.id} cobrado sin orden asociada (metadata.orderId=${orderId ?? "—"})`);
    await notifyAdmin({
      dedupeKey: `orphan-payment:${paymentIntent.id}`,
      title: "Payment received without an order",
      details: `Stripe PaymentIntent ${paymentIntent.id} succeeded but no order is linked to it (metadata.orderId=${orderId ?? "—"}).\nReview it in the Stripe dashboard and refund or create the order manually.`,
      orderId: null,
    });
    return { action: "orphan_payment", orderId };
  }

  if (TERMINAL.has(order.status)) return { action: `skipped:${order.status}`, orderId: order.id };

  if (order.status === "OVERSELL_REFUND_PENDING") return oversell(order.id, client);

  // PENDING_PAYMENT
  const result = await confirmOrder(order.id); // excepción transitoria → la ruta responde 5xx
  if (result === "confirmed") {
    await sendOrderConfirmation(order.id);
    return { action: "confirmed", orderId: order.id };
  }
  if (result === "already_processed") return { action: "already_processed", orderId: order.id };
  return oversell(order.id, client);
}

async function oversell(orderId: string, client: StripeClient): Promise<WebhookOutcome> {
  const refund = await handleOversell(orderId, client);
  // Error transitorio con Stripe: se lanza para que la ruta responda 5xx y Stripe reintente el evento.
  if (refund === "REFUND_ERROR") throw new Error(`refund de la orden ${orderId}: error transitorio, se pide reintento`);
  return { action: `oversell:${refund}`, orderId };
}

// refund.updated / refund.failed: concluye reembolsos pendientes y detecta reembolsos que fallan después de
// haber salido `succeeded`. No se decide por el estado leído de la orden (puede cambiar en paralelo): se
// consulta el refund vigente en Stripe y se aplica con la transición atómica compartida (applyRefundOutcome).
async function onRefundChanged(eventRefund: Stripe.Refund, client: StripeClient): Promise<WebhookOutcome> {
  const metadataOrderId = eventRefund.metadata?.orderId;
  // Determinista: primero la orden que tiene guardado este refund; si ninguna, la de metadata.orderId.
  const order =
    (await db.order.findFirst({ where: { stripeRefundId: eventRefund.id }, select: { id: true, stripeRefundId: true } })) ??
    (metadataOrderId ? await db.order.findUnique({ where: { id: metadataOrderId }, select: { id: true, stripeRefundId: true } }) : null);
  // Refunds que no son de este flujo (p. ej. hechos a mano desde el panel de Stripe): no se tocan.
  if (!order) return { action: "ignored:refund_without_order" };
  // El refund debe ser el de esta orden: guardado, o creado por handleOversell con su metadata.orderId.
  if (order.stripeRefundId !== eventRefund.id && metadataOrderId !== order.id) {
    return { action: "ignored:refund_not_for_order", orderId: order.id };
  }

  // Estado vigente del refund (el del evento puede estar desactualizado). Un error aquí → 5xx y reintento.
  const refund = await client.refunds.retrieve(eventRefund.id);
  const result = await applyRefundOutcome(order.id, refund);
  return { action: `refund:${result}`, orderId: order.id };
}
