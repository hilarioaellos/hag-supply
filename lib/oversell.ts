import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { notifyAdminRefundFailed } from "@/lib/order-emails";

// CANCELLED_REFUNDED: Stripe confirmó el refund (succeeded).
// REFUND_PENDING: refund creado pero sin concluir (pending / requires_action); la orden queda
//   OVERSELL_REFUND_PENDING con su stripeRefundId y se reconcilia en el próximo intento (webhook
//   refund.updated, recarga de /order-confirmation).
// REFUND_ERROR: error transitorio al consultar/crear el refund; la orden queda OVERSELL_REFUND_PENDING y
//   el llamador decide si pedir reintento (el webhook responde 5xx para que Stripe reenvíe el evento).
// OVERSELL_REFUND_FAILED: Stripe informó que el refund falló o se canceló.
// SKIPPED: la orden no estaba en este flujo o ya se resolvió.
export type OversellResult = "CANCELLED_REFUNDED" | "REFUND_PENDING" | "REFUND_ERROR" | "OVERSELL_REFUND_FAILED" | "SKIPPED";

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
    return "REFUND_ERROR";
  }

  // b. El identificador se guarda apenas existe, sin dar el refund por concluido.
  if (order.stripeRefundId !== refund.id) {
    await db.order.updateMany({
      where: { id: order.id, status: "OVERSELL_REFUND_PENDING" },
      data: { stripeRefundId: refund.id },
    });
  }

  // c/d. El resultado se aplica con la misma transición atómica que usan los eventos de refund del webhook.
  return applyRefundOutcome(order.id, refund);
}

// Aplica el estado de un refund de Stripe a su orden con UPDATEs condicionados por estado e identidad, sin
// depender de lecturas previas (lo usan handleOversell y los eventos refund.updated / refund.failed, que
// pueden llegar duplicados, fuera de orden o en paralelo):
//   succeeded        → CANCELLED_REFUNDED, solo desde OVERSELL_REFUND_PENDING. Un `succeeded` atrasado nunca
//                      revierte un fallo ya registrado.
//   failed/canceled  → OVERSELL_REFUND_FAILED desde OVERSELL_REFUND_PENDING (este refund o ninguno guardado)
//                      o desde CANCELLED_REFUNDED con este mismo refund (falló después de completarse).
//                      El fallo es absorbente; el aviso al admin sale solo si esta llamada hizo la transición.
//   requires_action  → sigue pendiente + aviso al admin. pending → sigue pendiente.
export async function applyRefundOutcome(orderId: string, refund: Stripe.Refund): Promise<OversellResult> {
  switch (refund.status) {
    case "succeeded": {
      const done = await db.order.updateMany({
        where: { id: orderId, status: "OVERSELL_REFUND_PENDING", OR: [{ stripeRefundId: null }, { stripeRefundId: refund.id }] },
        data: { status: "CANCELLED_REFUNDED", stripeRefundId: refund.id },
      });
      return done.count === 1 ? "CANCELLED_REFUNDED" : skippedAfter(orderId, refund);
    }
    case "failed":
    case "canceled": {
      const reason = `refund ${refund.id} en estado ${refund.status}${refund.failure_reason ? ` (${refund.failure_reason})` : ""}`;
      const failed = await db.order.updateMany({
        where: {
          id: orderId,
          OR: [
            { status: "OVERSELL_REFUND_PENDING", OR: [{ stripeRefundId: null }, { stripeRefundId: refund.id }] },
            { status: "CANCELLED_REFUNDED", stripeRefundId: refund.id },
          ],
        },
        data: { status: "OVERSELL_REFUND_FAILED", stripeRefundId: refund.id },
      });
      if (failed.count === 1) {
        console.error(`[oversell] refund falló para la orden ${orderId}: ${reason}`);
        await notifyAdminRefundFailed(orderId, reason);
        return "OVERSELL_REFUND_FAILED";
      }
      return skippedAfter(orderId, refund);
    }
    case "requires_action":
      // Requiere intervención (p. ej. datos del cliente): se avisa al admin y se mantiene pendiente.
      await notifyAdminRefundFailed(orderId, `refund ${refund.id} requiere acción en Stripe`);
      return "REFUND_PENDING";
    default:
      // pending (u otro estado no final): se reconcilia en el próximo intento o evento.
      return "REFUND_PENDING";
  }
}

// La transición no aplicó: otro actor ya llegó al estado final (normal con eventos duplicados) o la orden está
// en un estado incompatible con este refund (se registra para revisión).
async function skippedAfter(orderId: string, refund: Stripe.Refund): Promise<OversellResult> {
  const { status, stripeRefundId } = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, stripeRefundId: true },
  });
  const settled =
    status === "OVERSELL_REFUND_FAILED" || (refund.status === "succeeded" && status === "CANCELLED_REFUNDED" && stripeRefundId === refund.id);
  if (!settled) {
    console.error(`[oversell] refund ${refund.id} (${refund.status}) no aplicable a la orden ${orderId} en estado ${status} (refund guardado: ${stripeRefundId ?? "—"})`);
  }
  return "SKIPPED";
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

// Fallo sin refund (la orden no tiene PaymentIntent): solo desde OVERSELL_REFUND_PENDING.
async function markFailed(orderId: string, reason: string): Promise<OversellResult> {
  console.error(`[oversell] refund falló para la orden ${orderId}: ${reason}`);
  const failed = await db.order.updateMany({
    where: { id: orderId, status: "OVERSELL_REFUND_PENDING" },
    data: { status: "OVERSELL_REFUND_FAILED" },
  });
  if (failed.count === 1) await notifyAdminRefundFailed(orderId, reason);
  return failed.count === 1 ? "OVERSELL_REFUND_FAILED" : "SKIPPED";
}
