import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { cancelRefundIssuedEmail, deliverPending, enqueueAdminAlert, enqueueRefundIssuedEmail } from "@/lib/order-emails";

// CANCELLED_REFUNDED: Stripe confirmó el refund (succeeded).
// REFUND_PENDING: refund creado pero sin concluir (pending / requires_action); la orden queda
//   OVERSELL_REFUND_PENDING con su stripeRefundId y se reconcilia en el próximo intento (webhook
//   refund.updated, recarga de /order-confirmation).
// REFUND_ERROR: error transitorio al consultar/crear el refund; la orden queda OVERSELL_REFUND_PENDING y
//   el llamador decide si pedir reintento (el webhook responde 5xx para que Stripe reenvíe el evento).
// OVERSELL_REFUND_FAILED: Stripe informó que el refund falló o se canceló.
// SKIPPED: la orden no estaba en este flujo o ya se resolvió.
// CANCEL_REFUND_FAILED: igual que OVERSELL_REFUND_FAILED pero para una cancelación desde el admin (lib/order-cancel.ts).
export type OversellResult =
  | "CANCELLED_REFUNDED"
  | "REFUND_PENDING"
  | "REFUND_ERROR"
  | "OVERSELL_REFUND_FAILED"
  | "CANCEL_REFUND_FAILED"
  | "SKIPPED";

// Estados con un reembolso en curso. Los dos flujos que reembolsan se distinguen por `cancelledAt`:
// nulo = oversell (nunca hubo stock), no nulo = cancelación desde el admin.
const REFUND_PENDING_STATUSES = ["OVERSELL_REFUND_PENDING", "CANCEL_REFUND_PENDING"] as const;

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
// depender de lecturas previas (lo usan handleOversell, cancelAndRefund y los eventos refund.updated /
// refund.failed, que pueden llegar duplicados, fuera de orden o en paralelo). "Pendiente" es
// OVERSELL_REFUND_PENDING o CANCEL_REFUND_PENDING; el flujo se identifica por `cancelledAt`:
//   succeeded        → CANCELLED_REFUNDED, solo desde un estado pendiente. Un `succeeded` atrasado nunca
//                      revierte un fallo ya registrado.
//   failed/canceled  → OVERSELL_REFUND_FAILED / CANCEL_REFUND_FAILED desde el pendiente de su flujo (este
//                      refund o ninguno guardado) o desde CANCELLED_REFUNDED con este mismo refund (falló
//                      después de completarse). El fallo es absorbente; el aviso al admin sale solo si esta
//                      llamada hizo la transición.
//   requires_action  → sigue pendiente + aviso al admin. pending → sigue pendiente.
export async function applyRefundOutcome(orderId: string, refund: Stripe.Refund): Promise<OversellResult> {
  switch (refund.status) {
    case "succeeded": {
      // En una cancelación (cancelledAt no nulo), el email "Refund issued" se encola en la misma transacción
      // que la transición: solo existe si Stripe confirmó el refund y esta llamada lo aplicó.
      const notify = await db.$transaction(async (tx) => {
        const done = await tx.order.updateMany({
          where: { id: orderId, status: { in: [...REFUND_PENDING_STATUSES] }, OR: [{ stripeRefundId: null }, { stripeRefundId: refund.id }] },
          data: { status: "CANCELLED_REFUNDED", stripeRefundId: refund.id },
        });
        if (done.count !== 1) return null;
        const { cancelledAt } = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { cancelledAt: true } });
        if (cancelledAt) await enqueueRefundIssuedEmail(tx, orderId, refund.id);
        return { cancelled: cancelledAt !== null };
      });
      if (!notify) return skippedAfter(orderId, refund);
      if (notify.cancelled) await deliverPending({ orderId, limit: 3, budgetMs: 8_000 });
      return "CANCELLED_REFUNDED";
    }
    case "failed":
    case "canceled": {
      const reason = `refund ${refund.id} en estado ${refund.status}${refund.failure_reason ? ` (${refund.failure_reason})` : ""}`;
      // Transición y aviso en una sola transacción: si el fallo queda registrado, el aviso también. Cada flujo
      // tiene su UPDATE (discriminado por cancelledAt); como mucho uno de los dos aplica.
      const sameRefund = (pending: "OVERSELL_REFUND_PENDING" | "CANCEL_REFUND_PENDING") => [
        { status: pending, OR: [{ stripeRefundId: null }, { stripeRefundId: refund.id }] },
        { status: "CANCELLED_REFUNDED" as const, stripeRefundId: refund.id },
      ];
      const failedFlow = await db.$transaction(async (tx) => {
        const oversell = await tx.order.updateMany({
          where: { id: orderId, cancelledAt: null, OR: sameRefund("OVERSELL_REFUND_PENDING") },
          data: { status: "OVERSELL_REFUND_FAILED", stripeRefundId: refund.id },
        });
        if (oversell.count === 1) {
          await enqueueAdminAlert(tx, refundFailedAlert(orderId, refund.id, reason));
          return "OVERSELL_REFUND_FAILED" as const;
        }
        const cancel = await tx.order.updateMany({
          where: { id: orderId, cancelledAt: { not: null }, OR: sameRefund("CANCEL_REFUND_PENDING") },
          data: { status: "CANCEL_REFUND_FAILED", stripeRefundId: refund.id },
        });
        if (cancel.count === 1) {
          // Si este refund llegó a salir succeeded, su aviso "Refund issued" aún no enviado deja de ser cierto.
          await cancelRefundIssuedEmail(tx, orderId, refund.id);
          await enqueueAdminAlert(tx, cancelRefundFailedAlert(orderId, refund.id, reason));
          return "CANCEL_REFUND_FAILED" as const;
        }
        return null;
      });
      if (failedFlow) {
        console.error(`[oversell] refund falló para la orden ${orderId}: ${reason}`);
        await deliverPending({ orderId, limit: 3, budgetMs: 8_000 });
        return failedFlow;
      }
      return skippedAfter(orderId, refund);
    }
    case "requires_action": {
      // Requiere intervención (p. ej. datos del cliente): se mantiene pendiente y se avisa UNA vez por refund,
      // y solo si sigue aplicando: la orden debe seguir OVERSELL_REFUND_PENDING con este refund. El UPDATE
      // condicionado bloquea la fila hasta el commit, así una resolución concurrente no se cruza con el aviso.
      // Un fallo al encolar se propaga (el webhook responde 5xx y Stripe reintenta).
      const applies = await db.$transaction(async (tx) => {
        const still = await tx.order.updateMany({
          where: { id: orderId, status: { in: [...REFUND_PENDING_STATUSES] }, OR: [{ stripeRefundId: null }, { stripeRefundId: refund.id }] },
          data: { stripeRefundId: refund.id },
        });
        if (still.count !== 1) return false;
        await enqueueAdminAlert(tx, {
          dedupeKey: `refund-requires-action:${orderId}:${refund.id}`,
          title: "Refund requires action in Stripe",
          details: `Order ${orderId}: refund ${refund.id} needs action in the Stripe dashboard before it can complete.`,
          orderId,
        });
        return true;
      });
      if (!applies) return skippedAfter(orderId, refund);
      await deliverPending({ orderId, limit: 3, budgetMs: 8_000 });
      return "REFUND_PENDING";
    }
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
    status === "OVERSELL_REFUND_FAILED" ||
    status === "CANCEL_REFUND_FAILED" ||
    (refund.status === "succeeded" && status === "CANCELLED_REFUNDED" && stripeRefundId === refund.id);
  if (!settled) {
    console.error(`[oversell] refund ${refund.id} (${refund.status}) no aplicable a la orden ${orderId} en estado ${status} (refund guardado: ${stripeRefundId ?? "—"})`);
  }
  return "SKIPPED";
}

// Compartida con cancelAndRefund. La idempotencyKey es por orden: una orden solo puede estar en uno de los
// dos flujos (oversell nunca llega a pagada; la cancelación solo parte de un pedido pagado).
export async function findOrCreateRefund(
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
  const transitioned = await db.$transaction(async (tx) => {
    const failed = await tx.order.updateMany({
      where: { id: orderId, status: "OVERSELL_REFUND_PENDING" },
      data: { status: "OVERSELL_REFUND_FAILED" },
    });
    if (failed.count === 1) await enqueueAdminAlert(tx, refundFailedAlert(orderId, "sin-refund", reason));
    return failed.count === 1;
  });
  if (transitioned) await deliverPending({ orderId, limit: 3, budgetMs: 8_000 });
  return transitioned ? "OVERSELL_REFUND_FAILED" : "SKIPPED";
}

// Cancelación desde el admin cuyo reembolso falló: el cliente ya recibió el email de cancelación con el
// reembolso anunciado, así que hay que reembolsar a mano y avisarle.
export function cancelRefundFailedAlert(orderId: string, refundId: string, reason: string) {
  return {
    dedupeKey: `cancel-refund-failed:${orderId}:${refundId}`,
    title: "Cancellation refund failed — manual refund needed",
    details: `Order ${orderId} was cancelled from the admin, but the refund could not be completed (${reason}).\nA cancellation email saying the refund is being processed was queued for the customer; no "Refund issued" email will go out for this refund. Refund them from the Stripe dashboard, then record that refund on the order ("Mark refunded") so they are notified.`,
    orderId,
  };
}

function refundFailedAlert(orderId: string, refundId: string, reason: string) {
  return {
    dedupeKey: `refund-failed:${orderId}:${refundId}`,
    title: "Refund failed — manual refund needed",
    details: `Order ${orderId}: an item sold out after payment and the automatic refund could not be completed (${reason}).\nThe customer was told our team will refund them manually. Refund them from the Stripe dashboard and contact them.`,
    orderId,
  };
}
