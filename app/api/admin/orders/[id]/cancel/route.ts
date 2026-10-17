import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withAdmin } from "@/lib/auth-guards";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelAndRefund } from "@/lib/order-cancel";

// POST /api/admin/orders/[id]/cancel — cancela un pedido pagado y no despachado y lo reembolsa por completo.
// Con el pedido en CANCEL_REFUND_PENDING, la misma llamada reintenta el reembolso. Body opcional: { reason }.
export const POST = withAdmin(async (req: NextRequest, context: unknown) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const session = await getServerSession(authOptions);
  const body = await req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : null;

  const exists = await db.order.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const result = await cancelAndRefund(id, { email: session?.user?.email ?? "admin", reason });
  const { status } = await db.order.findUniqueOrThrow({ where: { id }, select: { status: true } });

  if (result === "NOT_CANCELLABLE") {
    return NextResponse.json({ error: "Only paid orders that have not shipped can be cancelled.", status }, { status: 409 });
  }
  if (result === "REFUND_ERROR") {
    // El pedido queda cancelado con el reembolso pendiente; el admin puede reintentar.
    return NextResponse.json({ error: "Stripe could not be reached. The order is cancelled; retry the refund.", result, status }, { status: 502 });
  }
  return NextResponse.json({ result, status });
});
