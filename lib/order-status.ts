import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";

// Cambios de estado manuales del admin (despacho). Los estados de pago, oversell y cancelación no tienen
// transiciones manuales: los mueven sus propios flujos.
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [],
  PAYMENT_CONFIRMED: ["PROCESSING"],
  PROCESSING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  OVERSELL_REFUND_PENDING: [],
  OVERSELL_REFUND_FAILED: [],
  CANCELLED_REFUNDED: [],
  CANCEL_REFUND_PENDING: [],
  CANCEL_REFUND_FAILED: [],
};

export type StatusChange =
  | { ok: true; status: OrderStatus }
  | { ok: false; code: 404 | 409; error: string };

// Lee el estado, valida la transición y la aplica con un UPDATE condicionado al estado leído y a que el pedido
// no esté cancelado. Si otra petición lo cambió entre la lectura y la escritura (p. ej. "Cancel & refund"),
// el UPDATE no aplica y se responde 409: nunca se pisa una cancelación ni se despacha un pedido reembolsado.
export async function changeOrderStatus(orderId: string, to: OrderStatus): Promise<StatusChange> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) return { ok: false, code: 404, error: "Order not found" };
  return applyStatusTransition(orderId, order.status, to);
}

// La escritura condicionada, separada para poder probar una lectura desactualizada.
export async function applyStatusTransition(orderId: string, from: OrderStatus, to: OrderStatus): Promise<StatusChange> {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    return { ok: false, code: 409, error: `Cannot transition from ${from} to ${to}` };
  }
  const updated = await db.order.updateMany({
    where: { id: orderId, status: from, cancelledAt: null },
    data: { status: to },
  });
  if (updated.count !== 1) {
    return { ok: false, code: 409, error: "The order changed while updating (it may have been cancelled). Reload the page." };
  }
  return { ok: true, status: to };
}
