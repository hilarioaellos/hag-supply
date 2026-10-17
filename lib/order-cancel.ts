import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import {
  cancelPendingConfirmation,
  deliverPending,
  enqueueAdminAlert,
  enqueueCancellationEmail,
  enqueueRefundIssuedEmail,
} from "@/lib/order-emails";
import { applyRefundOutcome, cancelRefundFailedAlert, findOrCreateRefund, type OversellResult } from "@/lib/oversell";

// Cancelar y reembolsar desde el admin un pedido pagado y no despachado (Returns → "Order cancellations").
//
// 1. Transición atómica PAYMENT_CONFIRMED / PROCESSING → CANCEL_REFUND_PENDING, en una sola transacción con:
//    quién/cuándo/motivo, la devolución del stock de cada item, la anulación de la confirmación aún no enviada
//    y el email de cancelación (que anuncia el reembolso en gestión, no emitido). Solo la llamada que hace la
//    transición aplica todo eso: dos clics simultáneos no duplican nada. Los cambios de estado manuales
//    (lib/order-status.ts) exigen cancelledAt nulo, así que tampoco pueden pisar una cancelación.
//    El email "Refund issued" sale aparte, solo cuando Stripe confirma el refund (applyRefundOutcome).
// 2. Reembolso total en Stripe con el flujo compartido con oversell: se busca o crea con metadata.orderId e
//    idempotencyKey por orden, se guarda su id y el resultado se aplica con applyRefundOutcome (la misma
//    transición atómica que usa el webhook refund.updated / refund.failed).
// 3. Reanudable: si el pedido ya está CANCEL_REFUND_PENDING (refund pendiente o error transitorio), llamar de
//    nuevo retoma el reembolso sin repetir el paso 1.
//
// NOT_CANCELLABLE: el pedido no está pagado-sin-despachar ni en una cancelación en curso (p. ej. SHIPPED,
// DELIVERED, PENDING_PAYMENT, un oversell). ALREADY_DONE: la cancelación ya terminó (reembolsada o fallida).
export type CancelResult = Exclude<OversellResult, "OVERSELL_REFUND_FAILED" | "SKIPPED"> | "NOT_CANCELLABLE" | "ALREADY_DONE";

type StripeClient = typeof stripe;

const CANCELLABLE = ["PAYMENT_CONFIRMED", "PROCESSING"] as const;

export async function cancelAndRefund(
  orderId: string,
  actor: { email: string; reason?: string | null },
  client: StripeClient = stripe
): Promise<CancelResult> {
  // 1. Transición + stock + email, todo o nada.
  await db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { in: [...CANCELLABLE] }, cancelledAt: null },
      data: {
        status: "CANCEL_REFUND_PENDING",
        cancelledAt: new Date(),
        cancelledBy: actor.email,
        cancelReason: actor.reason?.trim().slice(0, 500) || null,
      },
    });
    if (claimed.count !== 1) return;
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } });
    for (const item of items) {
      await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
    }
    await cancelPendingConfirmation(tx, orderId);
    await enqueueCancellationEmail(tx, orderId);
  });

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { id: true, orderNumber: true, status: true, cancelledAt: true, stripePaymentIntentId: true, stripeRefundId: true },
  });
  if (order.status !== "CANCEL_REFUND_PENDING") {
    if (order.cancelledAt && (order.status === "CANCELLED_REFUNDED" || order.status === "CANCEL_REFUND_FAILED")) return "ALREADY_DONE";
    return "NOT_CANCELLABLE";
  }

  const result = await refund(order, client);
  // El email de cancelación (y un posible aviso de fallo) salen enseguida, dentro de un presupuesto acotado;
  // si no alcanzan, los retoman el cron y el webhook.
  await deliverPending({ orderId, limit: 3, budgetMs: 8_000 });
  return result;
}

async function refund(
  order: { id: string; orderNumber: string; stripePaymentIntentId: string | null; stripeRefundId: string | null },
  client: StripeClient
): Promise<CancelResult> {
  if (!order.stripePaymentIntentId) {
    // Pedido pagado sin PaymentIntent (no debería ocurrir con Stripe): no hay cobro que devolver por API.
    return markFailed(order.id, "la orden no tiene PaymentIntent");
  }

  let stripeRefund;
  try {
    stripeRefund = await findOrCreateRefund(client, order as typeof order & { stripePaymentIntentId: string });
  } catch (error) {
    // Error de red o de Stripe: no prueba que el refund haya fallado. Queda CANCEL_REFUND_PENDING para
    // reintentar desde el admin (idempotencyKey por orden: reintentar no duplica el refund).
    console.error(`[order-cancel] error transitorio en el refund de la orden ${order.id}:`, error instanceof Error ? error.message : error);
    return "REFUND_ERROR";
  }

  if (order.stripeRefundId !== stripeRefund.id) {
    await db.order.updateMany({
      where: { id: order.id, status: "CANCEL_REFUND_PENDING" },
      data: { stripeRefundId: stripeRefund.id },
    });
  }

  const outcome = await applyRefundOutcome(order.id, stripeRefund);
  if (outcome === "OVERSELL_REFUND_FAILED") return "CANCEL_REFUND_FAILED"; // no ocurre: cancelledAt no es nulo
  if (outcome === "SKIPPED") {
    // Otro actor (webhook) resolvió el refund en paralelo: se informa el estado real.
    const { status } = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
    if (status === "CANCELLED_REFUNDED") return "CANCELLED_REFUNDED";
    if (status === "CANCEL_REFUND_FAILED") return "CANCEL_REFUND_FAILED";
    return "REFUND_PENDING";
  }
  return outcome;
}

// Cierre de un CANCEL_REFUND_FAILED que el admin reembolsó a mano en el dashboard de Stripe. Se verifica en
// Stripe que el refund indicado sea de este pago, esté `succeeded` y cubra el total; recién entonces la orden
// pasa a CANCELLED_REFUNDED con ese refund guardado (así sus eventos de webhook se reconocen) y se avisa al
// comprador que el reembolso se emitió.
export type ManualRefundResult =
  | { ok: true }
  | { ok: false; error: string; code: 409 | 422 | 502 };

export async function markRefundedManually(
  orderId: string,
  refundId: string,
  actor: { email: string },
  client: StripeClient = stripe
): Promise<ManualRefundResult> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, stripePaymentIntentId: true, total: true, notes: true },
  });
  if (order.status !== "CANCEL_REFUND_FAILED") return { ok: false, code: 409, error: "Only orders whose cancellation refund failed can be closed this way." };
  if (!/^re_[A-Za-z0-9]+$/.test(refundId)) return { ok: false, code: 422, error: "Enter a Stripe refund ID (re_…)." };

  let refund;
  try {
    refund = await client.refunds.retrieve(refundId);
  } catch (error) {
    // Solo "no existe" es un error del dato; un timeout, error de auth o caída de Stripe se puede reintentar.
    const { code, statusCode } = (error ?? {}) as { code?: string; statusCode?: number };
    if (code === "resource_missing" || statusCode === 404) return { ok: false, code: 422, error: "Stripe has no refund with that ID." };
    console.error(`[order-cancel] no se pudo consultar el refund ${refundId}:`, error instanceof Error ? error.message : error);
    return { ok: false, code: 502, error: "Couldn't reach Stripe to check that refund. Try again in a moment." };
  }
  const paymentIntent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  if (paymentIntent !== order.stripePaymentIntentId) return { ok: false, code: 422, error: "That refund belongs to a different payment." };
  if (refund.status !== "succeeded") return { ok: false, code: 422, error: `That refund is ${refund.status}, not succeeded.` };
  const totalCents = Math.round(Number(order.total) * 100);
  if (refund.amount < totalCents) return { ok: false, code: 422, error: `That refund is $${(refund.amount / 100).toFixed(2)}, less than the order total.` };

  const note = `Refund completed manually in Stripe (${refundId}) — recorded by ${actor.email} on ${new Date().toISOString()}`;
  const closed = await db.$transaction(async (tx) => {
    const done = await tx.order.updateMany({
      where: { id: orderId, status: "CANCEL_REFUND_FAILED" },
      data: { status: "CANCELLED_REFUNDED", stripeRefundId: refundId, notes: order.notes ? `${order.notes}\n${note}` : note },
    });
    if (done.count !== 1) return false;
    await enqueueRefundIssuedEmail(tx, orderId, refundId);
    return true;
  });
  if (!closed) return { ok: false, code: 409, error: "The order changed while updating. Reload the page." };
  await deliverPending({ orderId, limit: 3, budgetMs: 8_000 });
  return { ok: true };
}

async function markFailed(orderId: string, reason: string): Promise<CancelResult> {
  console.error(`[order-cancel] refund falló para la orden ${orderId}: ${reason}`);
  await db.$transaction(async (tx) => {
    const failed = await tx.order.updateMany({
      where: { id: orderId, status: "CANCEL_REFUND_PENDING" },
      data: { status: "CANCEL_REFUND_FAILED" },
    });
    if (failed.count === 1) await enqueueAdminAlert(tx, cancelRefundFailedAlert(orderId, "sin-refund", reason));
  });
  return "CANCEL_REFUND_FAILED";
}
