import { NextRequest, NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { ALLOWED_TRANSITIONS, changeOrderStatus } from "@/lib/order-status";

export const PATCH = withAdmin(async (req: NextRequest, context: unknown) => {
  const params = await (context as { params: Promise<{ id: string }> }).params;
  const body = await req.json();
  const { status: newStatus } = body;

  if (!newStatus || !(newStatus in ALLOWED_TRANSITIONS)) {
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  }

  // Transición condicionada al estado leído (lib/order-status.ts): 409 si el pedido cambió en paralelo.
  const result = await changeOrderStatus(params.id, newStatus as OrderStatus);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.code });

  const updated = await db.order.findUniqueOrThrow({ where: { id: params.id } });
  return NextResponse.json(updated);
});
