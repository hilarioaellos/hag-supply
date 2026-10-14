import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { notifyAdminRefundFailed } from "@/lib/order-emails";

// CANCELLED_REFUNDED: Stripe confirmó el refund (succeeded).
// REFUND_PENDING: refund creado pero sin concluir (pending / requires_action) o error transitorio; la
//   orden queda OVERSELL_REFUND_PENDING con su stripeRefundId y se reconcilia en el próximo intento
//   (otra llamada a handleOversell: webhook HAG-95, reintento de Stripe o acción del admin).
// OVERSELL_REFUND_FAILED: Stripe informó que el refund falló o se canceló.
// SKIPPED: la orden no estaba en este flujo o ya se resolvió.
export type OversellResult = "CANCELLED_REFUNDED" | "REFUND_PENDING" | "OVERSELL_REFUND_FAILED" | "SKIPPED";

type StripeClient = typeof stripe;

// Flujo de oversell (plan MVP, sección D paso 7). Lo comparten el checkout (reconcile), el webhook
// (HAG-95) y el confirm-payment del admin: el pago se cobró pero no hay stock, así que se reembolsa.
// Idempotente y reanudable: el refund se busca por stripeRefundId guardado o por metadata.orderId antes de
// crear uno nuevo, y la orden solo se da por reembolsada cuando Stripe informa `succeeded`.
export async function handleOversell(orderId: string, client: StripeClient = stripe): Promise<OversellResult> {
  // a. PENDING_PAYMENT → OVERSELL_REFUND_PENDING (si ya lo estaba, se continúa desde ahí).
  await db.order.updateMany({
    where: { id: orderId, status: "PENDING_PAYMENT" },
    data: { status: "OVERSELL_REFUND_PENDING" },
  });

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true, stripePaymentIntentId: true, stripeRefundId: true },
  });
  if (order.status !== "OVERSELL_REFUND_PENDING") return "SKIPPED";

  if (!order.stripePaymentIntentId) {
    // Sin PaymentIntent no hay cobro que devolver ni reintento que lo arregle: falla real.
    return markFailed(order.id, "la orden no tiene PaymentIntent");
  }

  let refund: Stripe.Refund;
  try {
    refund = await findOrCreateRefund(client, order as typeof order & { stripePaymentIntentId: string });
  } catch (error) {
    // Error de red o de Stripe al consultar/crear: no prueba que el refund haya fallado. Se deja pendiente
    // para reintentar (el refund tiene idempotencyKey, así que reintentar no duplica).
    console.error(`[oversell] error transitorio en el refund de la orden ${order.id}:`, error instanceof Error ? error.message : error);
    return "REFUND_PENDING";
  }

  // b. El identificador se guarda apenas existe, sin dar el refund por concluido.
  if (order.stripeRefundId !== refund.id) {
    await db.order.updateMany({
      where: { id: order.id, status: "OVERSELL_REFUND_PENDING" },
      data: { stripeRefundId: refund.id },
    });
  }

  switch (refund.status) {
    case "succeeded": {
      // c. Refund confirmado por Stripe → CANCELLED_REFUNDED.
      const done = await db.order.updateMany({
        where: { id: order.id, status: "OVERSELL_REFUND_PENDING" },
        data: { status: "CANCELLED_REFUNDED", stripeRefundId: refund.id },
      });
      return done.count === 1 ? "CANCELLED_REFUNDED" : "SKIPPED";
    }
    case "failed":
    case "canceled":
      // d. Fallo real informado por Stripe.
      return markFailed(order.id, `refund ${refund.id} en estado ${refund.status}${refund.failure_reason ? ` (${refund.failure_reason})` : ""}`);
    case "requires_action":
      // Requiere intervención (p. ej. datos del cliente): se avisa al admin y se mantiene pendiente.
      await notifyAdminRefundFailed(order.id, `refund ${refund.id} requiere acción en Stripe`);
      return "REFUND_PENDING";
    default:
      // pending (u otro estado no final): se reconcilia en el próximo intento.
      return "REFUND_PENDING";
  }
}

async function findOrCreateRefund(
  client: StripeClient,
  order: { id: string; orderNumber: string; stripePaymentIntentId: string; stripeRefundId: string | null }
): Promise<Stripe.Refund> {
  // Ya guardado: se consulta su estado actual (tener el id no demuestra que haya concluido).
  if (order.stripeRefundId) return client.refunds.retrieve(order.stripeRefundId);

  // Creado en Stripe pero no guardado (caída entre ambos pasos): se reutiliza.
  const existing = await client.refunds.list({ payment_intent: order.stripePaymentIntentId, limit: 100 });
  const found = existing.data.find((r) => r.metadata?.orderId === order.id);
  if (found) return found;

  return client.refunds.create(
    {
      payment_intent: order.stripePaymentIntentId,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
    },
    { idempotencyKey: `refund-${order.id}` }
  );
}

async function markFailed(orderId: string, reason: string): Promise<OversellResult> {
  console.error(`[oversell] refund falló para la orden ${orderId}: ${reason}`);
  const failed = await db.order.updateMany({
    where: { id: orderId, status: "OVERSELL_REFUND_PENDING" },
    data: { status: "OVERSELL_REFUND_FAILED" },
  });
  if (failed.count === 1) await notifyAdminRefundFailed(orderId, reason);
  return failed.count === 1 ? "OVERSELL_REFUND_FAILED" : "SKIPPED";
}
