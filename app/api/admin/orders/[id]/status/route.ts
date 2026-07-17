import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: [],
  PAYMENT_CONFIRMED: ["PROCESSING"],
  PROCESSING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  OVERSELL_REFUND_PENDING: [],
  OVERSELL_REFUND_FAILED: [],
  CANCELLED_REFUNDED: [],
};

export const PATCH = withAdmin(async (req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };
  const body = await req.json();
  const { status: newStatus } = body;

  if (!newStatus) {
    return NextResponse.json(
      { error: "Status is required" },
      { status: 400 }
    );
  }

  const order = await db.order.findUnique({
    where: { id: params.id },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      {
        error: `Cannot transition from ${order.status} to ${newStatus}`,
      },
      { status: 409 }
    );
  }

  const updated = await db.order.update({
    where: { id: params.id },
    data: { status: newStatus },
  });

  return NextResponse.json(updated);
});
