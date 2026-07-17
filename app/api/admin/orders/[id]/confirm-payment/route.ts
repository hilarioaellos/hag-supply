import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { confirmOrder } from "@/lib/confirm-order";

export const POST = withAdmin(async (req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };

  const order = await db.order.findUnique({
    where: { id: params.id },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // PASO 1: Verificar que está en PENDING_PAYMENT
  if (order.status !== "PENDING_PAYMENT") {
    return NextResponse.json(
      { error: "Order is not pending payment" },
      { status: 409 }
    );
  }

  // PASO 2: Verificar que stripePaymentIntentId existe
  if (!order.stripePaymentIntentId) {
    return NextResponse.json(
      { error: "No Stripe payment intent for this order" },
      { status: 422 }
    );
  }

  // TODO: PASO 3: Consultar Stripe para verificar que el pago está confirmed (HAG-16)
  // Stripe integration will be added in HAG-16-19 (Checkout & Stripe phase)

  // PASO 4: Llamar confirmOrder() (función compartida)
  try {
    const result = await confirmOrder(params.id);

    if (result === "confirmed") {
      // TODO: Enviar email de confirmación (HAG-27)
      return NextResponse.json({ success: true, result });
    }

    if (result === "already_processed") {
      return NextResponse.json({ success: true, result });
    }

    if (result === "oversell") {
      // TODO: Manejar flujo de oversell (refund, etc.)
      return NextResponse.json(
        { error: "Oversell detected", result },
        { status: 409 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Error confirming order" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: "Unknown error" },
    { status: 500 }
  );
});
