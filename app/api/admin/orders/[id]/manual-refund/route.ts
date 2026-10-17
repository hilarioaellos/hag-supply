import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withAdmin } from "@/lib/auth-guards";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { markRefundedManually } from "@/lib/order-cancel";

// POST /api/admin/orders/[id]/manual-refund — cierra un CANCEL_REFUND_FAILED reembolsado a mano en Stripe.
// Body: { refundId: "re_…" }. El refund se verifica en Stripe (mismo pago, succeeded, monto ≥ total).
export const POST = withAdmin(async (req: NextRequest, context: unknown) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const session = await getServerSession(authOptions);
  const body = await req.json().catch(() => ({}));
  const refundId = typeof body?.refundId === "string" ? body.refundId.trim() : "";

  const exists = await db.order.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const result = await markRefundedManually(id, refundId, { email: session?.user?.email ?? "admin" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json({ ok: true });
});
