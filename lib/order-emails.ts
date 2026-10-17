import type { Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { db } from "@/lib/db";
import {
  renderAdminAlert,
  renderNewOrderNotification,
  renderOrderCancelled,
  renderOrderConfirmation,
  renderRefundIssued,
} from "@/lib/email-templates";

// Emails transaccionales con bandeja de salida durable (HAG-103).
//
// 1. Encolar: el email se guarda en EmailOutbox DENTRO de la transacción que cambia el estado que lo origina
//    (confirmOrder → confirmación al comprador + aviso de venta nueva; OVERSELL_REFUND_FAILED → aviso al admin). Si el estado cambió,
//    el email existe; si la transacción se revierte, tampoco queda el email.
// 2. Entregar: después del commit se intenta enviar. Cada envío reclama la fila de forma atómica
//    (PENDING → SENDING con lock y token propio), así dos procesos no envían el mismo email, y una ejecución
//    cuyo lock venció no pisa el resultado de la que la reemplazó. El envío tiene timeout (< lock). Si falla,
//    vuelve a PENDING con espera creciente; tras MAX_ATTEMPTS queda FAILED. Reintentan: el barrido de cada
//    evento del webhook, el cron diario (/api/cron/email-outbox) y la página de confirmación de la orden.
// 3. dedupeKey es única: el mismo email no se encola dos veces, y se manda a Resend como Idempotency-Key.

type Tx = Prisma.TransactionClient;

export type OutgoingEmail = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};
export type EmailSender = (email: OutgoingEmail) => Promise<{ id: string }>;
// "deferred": no quedaba tiempo para un envío completo antes del deadline; la fila vuelve a PENDING sin gastar intento.
// "cancelled": el email dejó de corresponder al pedido antes de entregarlo (confirmación de un pedido cancelado,
// aviso de un refund que falló o fue reemplazado); no se envía.
export type DeliveryResult = "sent" | "retry" | "failed" | "not_configured" | "skipped" | "deferred" | "cancelled";

export class EmailNotConfiguredError extends Error {}

const MAX_ATTEMPTS = 8;
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360, 720, 1440];
const LOCK_MS = 2 * 60 * 1000;
// nextAttemptAt por defecto lo fija el motor de Prisma y "ahora" el reloj de Node: pueden diferir en algunos ms.
// Con esta tolerancia un email recién encolado ya cuenta como vencido para el envío inmediato.
const DUE_TOLERANCE_MS = 1_000;
const dueBefore = (now: Date) => new Date(now.getTime() + DUE_TOLERANCE_MS);

const fromAddress = () => process.env.EMAIL_FROM ?? "HAG Supply <orders@hagpartner.com>";
const replyToAddress = () => process.env.EMAIL_REPLY_TO ?? "orders@hagpartner.com";
const adminAddress = () => process.env.ADMIN_ALERT_EMAIL ?? "alertas@hagpartner.com";
// Aviso de venta nueva (HAG-123): destinatario propio opcional; si no, el mismo de los avisos al admin.
const orderNotifyAddress = () => process.env.ORDER_NOTIFY_EMAIL ?? adminAddress();

let resendClient: Resend | null = null;

// Envío real por Resend. Sin RESEND_API_KEY los emails quedan PENDING (no se pierden ni gastan intentos).
export const resendSender: EmailSender = async (email) => {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "re_") throw new EmailNotConfiguredError("RESEND_API_KEY no configurada");
  resendClient ??= new Resend(key);
  const { data, error } = await resendClient.emails.send(
    { from: email.from, to: email.to, replyTo: email.replyTo, subject: email.subject, html: email.html, text: email.text },
    { idempotencyKey: email.idempotencyKey }
  );
  if (error || !data) throw new Error(`Resend: ${error?.name ?? "error"} — ${error?.message ?? "sin respuesta"}`);
  return { id: data.id };
};

// ── Encolar ─────────────────────────────────────────────────────────────────────────────────────────

// Emails de una compra confirmada: confirmación al comprador + aviso de venta nueva al dueño (HAG-123).
// Se llama dentro de la transacción de confirmOrder: existen ambos si la compra se confirma, ninguno si se revierte.
export async function enqueueOrderEmails(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { media: { select: { url: true }, orderBy: { order: "asc" }, take: 1 } } } } },
    },
  });
  const data = {
    orderNumber: order.orderNumber,
    orderId: order.id,
    createdAt: order.createdAt,
    buyerName: order.buyerName,
    items: order.items.map((i) => ({
      name: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toFixed(2),
      total: i.total.toFixed(2),
      imageUrl: i.product.media[0]?.url ?? null,
    })),
    subtotal: order.subtotal.toFixed(2),
    shippingCost: order.shippingCost.toFixed(2),
    total: order.total.toFixed(2),
    shipping: {
      name: order.shippingName,
      line1: order.shippingLine1,
      line2: order.shippingLine2,
      city: order.shippingCity,
      state: order.shippingState,
      zip: order.shippingZip,
    },
  };
  await tx.emailOutbox.createMany({
    data: [
      { dedupeKey: `order-confirmation:${orderId}`, kind: "ORDER_CONFIRMATION", orderId, to: order.buyerEmail, ...renderOrderConfirmation(data) },
      {
        dedupeKey: `admin:new-order:${orderId}`,
        kind: "ADMIN_NEW_ORDER",
        orderId,
        to: orderNotifyAddress(),
        ...renderNewOrderNotification({ ...data, buyerEmail: order.buyerEmail }),
      },
    ],
    skipDuplicates: true,
  });
}

// Aviso de cancelación al comprador. Se llama dentro de la transacción que pasa la orden a
// CANCEL_REFUND_PENDING: si la cancelación se confirma, el email existe; si se revierte, tampoco queda.
export async function enqueueCancellationEmail(tx: Tx, orderId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  await tx.emailOutbox.createMany({
    data: [
      {
        dedupeKey: `order-cancelled:${orderId}`,
        kind: "ORDER_CANCELLED",
        orderId,
        to: order.buyerEmail,
        ...renderOrderCancelled({
          orderNumber: order.orderNumber,
          orderId: order.id,
          buyerName: order.buyerName,
          items: order.items.map((i) => ({ name: i.productName, quantity: i.quantity })),
          total: order.total.toFixed(2),
        }),
      },
    ],
    skipDuplicates: true,
  });
}

// Reembolso emitido de una cancelación: solo cuando Stripe lo confirma (succeeded) o el admin registra un
// refund manual verificado. Dentro de la transacción que pasa la orden a CANCELLED_REFUNDED.
// La clave es por pedido Y refund: si el refund A falla después y se reemplaza por B, el aviso de B es un
// hecho distinto (no lo descarta la deduplicación de A).
const refundIssuedKey = (orderId: string, refundId: string) => `order-refunded:${orderId}:${refundId}`;

export async function enqueueRefundIssuedEmail(tx: Tx, orderId: string, refundId: string): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  await tx.emailOutbox.createMany({
    data: [
      {
        dedupeKey: refundIssuedKey(orderId, refundId),
        kind: "ORDER_REFUNDED",
        orderId,
        to: order.buyerEmail,
        ...renderRefundIssued({ orderNumber: order.orderNumber, orderId: order.id, buyerName: order.buyerName, total: order.total.toFixed(2) }),
      },
    ],
    skipDuplicates: true,
  });
}

// El refund `refundId` falló: su aviso "Refund issued" aún no enviado se anula (PENDING o FAILED). Una fila
// en SENDING no se toca; si se retoma, deliverEmail comprueba que ese refund siga siendo el vigente.
export async function cancelRefundIssuedEmail(tx: Tx, orderId: string, refundId: string): Promise<void> {
  await tx.emailOutbox.updateMany({
    where: { dedupeKey: refundIssuedKey(orderId, refundId), status: { in: ["PENDING", "FAILED"] } },
    data: { status: "CANCELLED", lockedUntil: null, claimToken: null, lastError: "Refund failed before this notice was delivered" },
  });
}

// Vigencia de un email ligado al estado del pedido, comprobada justo antes de enviarlo (también al retomar un
// reintento o un reclamo vencido). Devuelve el motivo para anularlo, o null si sigue vigente.
//   ORDER_CONFIRMATION → no se envía si el pedido se canceló.
//   ORDER_REFUNDED     → solo si el pedido está CANCELLED_REFUNDED con ESE refund guardado (el de su clave).
async function staleReason(email: { kind: string; orderId: string | null; dedupeKey: string }): Promise<string | null> {
  if (!email.orderId || (email.kind !== "ORDER_CONFIRMATION" && email.kind !== "ORDER_REFUNDED")) return null;
  const order = await db.order.findUnique({
    where: { id: email.orderId },
    select: { cancelledAt: true, status: true, stripeRefundId: true },
  });
  if (!order) return "Order not found";
  if (email.kind === "ORDER_CONFIRMATION") return order.cancelledAt ? "Order cancelled before delivery" : null;
  const refundId = email.dedupeKey.slice(`order-refunded:${email.orderId}:`.length);
  const current = order.status === "CANCELLED_REFUNDED" && order.stripeRefundId === refundId;
  return current ? null : "Refund no longer valid (failed or replaced) before this notice was delivered";
}

// Al cancelar: la confirmación del pedido que aún no salió ya no se envía (ni ahora ni en sus reintentos).
// Una fila en SENDING no se toca aquí (puede estar en manos del proveedor); si ese intento falla, deliverEmail
// la anula antes de reintentar porque comprueba la cancelación de la orden.
export async function cancelPendingConfirmation(tx: Tx, orderId: string): Promise<void> {
  await tx.emailOutbox.updateMany({
    where: { orderId, kind: "ORDER_CONFIRMATION", status: { in: ["PENDING", "FAILED"] } },
    data: { status: "CANCELLED", lockedUntil: null, claimToken: null, lastError: "Order cancelled before delivery" },
  });
}

// Aviso al admin. dedupeKey identifica el hecho (p. ej. un refund concreto): repetirlo no genera otro email.
export async function enqueueAdminAlert(
  tx: Tx | typeof db,
  alert: { dedupeKey: string; title: string; details: string; orderId?: string | null }
): Promise<boolean> {
  const email = renderAdminAlert(alert.title, alert.details, alert.orderId);
  const created = await tx.emailOutbox.createMany({
    data: [{ dedupeKey: `admin:${alert.dedupeKey}`, kind: "ADMIN_ALERT", orderId: alert.orderId ?? null, to: adminAddress(), ...email }],
    skipDuplicates: true,
  });
  return created.count === 1;
}

// ── Entregar ────────────────────────────────────────────────────────────────────────────────────────

export async function deliverEmail(
  id: string,
  sender: EmailSender = resendSender,
  deadlineAt = Infinity
): Promise<DeliveryResult> {
  const deadline = effectiveDeadline(deadlineAt);
  if (deadline - Date.now() < minSendWindowMs()) return "deferred";
  const now = new Date();
  // Reclamo atómico con token propio: solo una ejecución pasa la fila a SENDING (o la retoma si el lock venció).
  const claimToken = randomUUID();
  const claimed = await db.emailOutbox.updateMany({
    where: {
      id,
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: dueBefore(now) } },
        { status: "SENDING", lockedUntil: { lt: now } },
      ],
    },
    data: { status: "SENDING", claimToken, lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return "skipped";
  // Toda escritura final exige seguir siendo el dueño del reclamo. Si el lock venció y otra ejecución tomó la
  // fila, esta no la toca (count = 0): ni marca SENT, ni la devuelve a PENDING, ni pisa el resultado ajeno.
  const owned = { id, status: "SENDING" as const, claimToken };

  const email = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
  // Email que ya no corresponde al estado del pedido (confirmación de un pedido cancelado, aviso de un refund
  // que falló o fue reemplazado): no se envía, se anula sin gastar intento.
  const stale = await staleReason(email);
  if (stale) {
    const voided = await db.emailOutbox.updateMany({
      where: owned,
      data: { status: "CANCELLED", attempts: { decrement: 1 }, lockedUntil: null, claimToken: null, lastError: stale },
    });
    if (voided.count !== 1) return lostClaim(email.dedupeKey, "cancelled");
    return "cancelled";
  }
  // HAG-122: el envío termina (o se corta) antes del deadline. Si la base tardó y ya no cabe un envío útil,
  // se libera el reclamo sin gastar intento y sin llamar al proveedor.
  if (deadline - Date.now() < minSendWindowMs()) {
    const released = await db.emailOutbox.updateMany({
      where: owned,
      data: { status: "PENDING", attempts: { decrement: 1 }, lockedUntil: null, claimToken: null },
    });
    if (released.count !== 1) return lostClaim(email.dedupeKey, "deferred");
    return "deferred";
  }
  const sendWindow = Math.min(sendTimeoutMs(), deadline - Date.now());
  try {
    const { id: providerMessageId } = await withTimeout(
      sender({
        from: fromAddress(),
        to: email.to,
        replyTo: replyToAddress(),
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: email.dedupeKey,
      }),
      sendWindow
    );
    const done = await db.emailOutbox.updateMany({
      where: owned,
      data: { status: "SENT", sentAt: new Date(), providerMessageId, lockedUntil: null, claimToken: null, lastError: null },
    });
    if (done.count !== 1) return lostClaim(email.dedupeKey, "sent");
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof EmailNotConfiguredError) {
      // Sin proveedor configurado no se gasta un intento: queda pendiente para cuando exista la clave.
      const released = await db.emailOutbox.updateMany({
        where: owned,
        data: { status: "PENDING", attempts: { decrement: 1 }, lockedUntil: null, claimToken: null, lastError: message },
      });
      if (released.count !== 1) return lostClaim(email.dedupeKey, "not_configured");
      console.warn(`[order-emails] ${email.dedupeKey} pendiente: ${message}`);
      return "not_configured";
    }
    const exhausted = email.attempts >= MAX_ATTEMPTS;
    const wait = BACKOFF_MINUTES[Math.min(email.attempts, BACKOFF_MINUTES.length) - 1] * 60 * 1000;
    const released = await db.emailOutbox.updateMany({
      where: owned,
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(Date.now() + wait),
        lockedUntil: null,
        claimToken: null,
        lastError: message.slice(0, 1000),
      },
    });
    if (released.count !== 1) return lostClaim(email.dedupeKey, "error");
    console.error(`[order-emails] envío de ${email.dedupeKey} falló (intento ${email.attempts}/${MAX_ATTEMPTS}): ${message}`);
    return exhausted ? "failed" : "retry";
  }
}

function lostClaim(dedupeKey: string, outcome: string): DeliveryResult {
  console.warn(`[order-emails] ${dedupeKey}: el reclamo venció y lo tomó otra ejecución; resultado tardío (${outcome}) descartado`);
  return "skipped";
}

// El envío no puede durar más que una fracción del lock: así no vence mientras se espera al proveedor.
const sendTimeoutMs = () => Number(process.env.EMAIL_SEND_TIMEOUT_MS ?? 15_000);

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`tiempo de envío agotado (${ms} ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── Deadline de la petición (HAG-122) ───────────────────────────────────────────────────────────────
//
// Una petición (webhook, cron) puede entregar emails en varios lotes: el aviso de un pago huérfano, la
// confirmación, el barrido final. Cada lote tiene su presupuesto, pero la suma no puede pasar el límite de la
// función. `withEmailDeadline` fija un deadline ABSOLUTO compartido por todos los lotes y envíos dentro de `fn`:
// ningún lote empieza un envío si no cabe un envío útil, y el timeout de cada envío se recorta para terminar
// antes del deadline. El tiempo que falta hasta `maxDuration` queda de reserva para la base y la respuesta.
const requestDeadline = new AsyncLocalStorage<number>();

// No se empieza un envío con menos ventana que esto antes del deadline (Resend suele responder en < 1 s).
const minSendWindowMs = () => Number(process.env.EMAIL_MIN_SEND_WINDOW_MS ?? 3_000);

export function withEmailDeadline<T>(deadlineAt: number, fn: () => Promise<T>): Promise<T> {
  return requestDeadline.run(effectiveDeadline(deadlineAt), fn);
}

// Ventanas de envío por ruta (HAG-122). Deben quedar holgadamente por debajo de su `maxDuration`:
// webhook 20 s de 30 s, cron 45 s de 60 s (lo verifica la suite).
export const WEBHOOK_EMAIL_WINDOW_MS = 20_000;
export const CRON_EMAIL_WINDOW_MS = 45_000;

// Deadline de los emails de una petición: `windowMs` desde que empezó. EMAIL_REQUEST_WINDOW_MS solo puede
// ACHICAR la ventana (lo usan las pruebas para no esperar 45 s); nunca la extiende más allá del límite.
export function requestEmailDeadline(startedAt: number, windowMs: number): number {
  const override = Number(process.env.EMAIL_REQUEST_WINDOW_MS);
  return startedAt + (override > 0 ? Math.min(override, windowMs) : windowMs);
}

// El menor entre el deadline propio y el de la petición en curso (si hay uno).
function effectiveDeadline(deadlineAt = Infinity): number {
  return Math.min(deadlineAt, requestDeadline.getStore() ?? Infinity);
}

// Envía los emails vencidos (opcionalmente solo los de una orden). No lanza: un fallo de entrega nunca rompe
// el flujo que la invoca. `budgetMs` es el tiempo en el que el lote debe TERMINAR (no solo dejar de empezar
// envíos): cada envío se recorta al tiempo restante. Además respeta el deadline de la petición, si lo hay.
// Los emails que no alcanzan a enviarse quedan PENDING para el próximo barrido.
export async function deliverPending(
  opts: { orderId?: string; limit?: number; sender?: EmailSender; budgetMs?: number } = {}
): Promise<Record<DeliveryResult, number>> {
  const counts: Record<DeliveryResult, number> = { sent: 0, retry: 0, failed: 0, not_configured: 0, skipped: 0, deferred: 0, cancelled: 0 };
  const deadline = effectiveDeadline(opts.budgetMs === undefined ? Infinity : Date.now() + opts.budgetMs);
  try {
    if (deadline - Date.now() < minSendWindowMs()) return counts;
    const now = new Date();
    const due = await db.emailOutbox.findMany({
      where: {
        ...(opts.orderId ? { orderId: opts.orderId } : {}),
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: dueBefore(now) } },
          { status: "SENDING", lockedUntil: { lt: now } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: opts.limit ?? 20,
    });
    for (const { id } of due) {
      if (deadline - Date.now() < minSendWindowMs()) break;
      counts[await deliverEmail(id, opts.sender, deadline)]++;
    }
  } catch (error) {
    console.error("[order-emails] deliverPending falló:", error instanceof Error ? error.message : error);
  }
  return counts;
}

// ── API usada por checkout, webhook y admin ─────────────────────────────────────────────────────────

// La confirmación ya quedó encolada dentro de confirmOrder; aquí solo se intenta el envío.
export async function sendOrderConfirmation(orderId: string, sender?: EmailSender): Promise<void> {
  await deliverPending({ orderId, sender, limit: 3, budgetMs: 10_000 });
}

// Aviso al admin fuera de una transacción de estado (p. ej. pago huérfano). Deduplicado por dedupeKey.
// Persistir el aviso es obligatorio: si falla el encolado, el error SE PROPAGA (el webhook responde 5xx y
// Stripe reintenta). Una vez encolado, un fallo de entrega queda a cargo de la bandeja de salida.
export async function notifyAdmin(
  alert: { dedupeKey: string; title: string; details: string; orderId?: string | null },
  sender?: EmailSender
): Promise<void> {
  console.error(`[order-emails] AVISO ADMIN ${alert.dedupeKey}: ${alert.title} — ${alert.details}`);
  const created = await enqueueAdminAlert(db, alert);
  if (created) await deliverPending({ orderId: alert.orderId ?? undefined, limit: 3, sender, budgetMs: 8_000 });
}

// ── Operación (HAG-121 / HAG-122) ───────────────────────────────────────────────────────────────────

// Un pendiente se considera atrasado si su próximo intento venció hace más de esto (el cron frecuente o el
// barrido del webhook ya debieron tomarlo).
export const OVERDUE_AFTER_MS = 30 * 60 * 1000;

export type OutboxHealth = { failed: number; overdue: number; oldestOverdueAt: Date | null };

export async function getOutboxHealth(now = new Date()): Promise<OutboxHealth> {
  const overdueWhere = {
    OR: [
      { status: "PENDING" as const, nextAttemptAt: { lt: new Date(now.getTime() - OVERDUE_AFTER_MS) } },
      { status: "SENDING" as const, lockedUntil: { lt: now } },
    ],
  };
  const [failed, overdue, oldest] = await Promise.all([
    db.emailOutbox.count({ where: { status: "FAILED" } }),
    db.emailOutbox.count({ where: overdueWhere }),
    db.emailOutbox.findFirst({ where: overdueWhere, orderBy: { nextAttemptAt: "asc" }, select: { nextAttemptAt: true } }),
  ]);
  return { failed, overdue, oldestOverdueAt: oldest?.nextAttemptAt ?? null };
}

// Reencola un email agotado (FAILED → PENDING, intentos a cero) y registra quién y cuándo. Condicionado al
// estado en el mismo UPDATE: si ya no está FAILED (otro admin lo reencoló, o se envió), no hace nada.
export async function requeueFailedEmail(id: string, adminEmail: string): Promise<boolean> {
  const now = new Date();
  const updated = await db.emailOutbox.updateMany({
    where: { id, status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: now,
      lockedUntil: null,
      claimToken: null,
      requeuedAt: now,
      requeuedBy: adminEmail,
      requeueCount: { increment: 1 },
    },
  });
  if (updated.count === 1) console.info(`[order-emails] email ${id} reencolado por ${adminEmail}`);
  return updated.count === 1;
}
