import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { confirmOrder } from "@/lib/confirm-order";
import { stripe } from "@/lib/stripe";
import { handleOversell } from "@/lib/oversell";
import { sendOrderConfirmation } from "@/lib/order-emails";

export const POST = withAdmin(async (req: NextRequest, context: unknown) => {
  const params = await (context as { params: Promise<{ id: string }> }).params;

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

  try {
    // PASO 3: Consultar Stripe — la seguridad real del botón: solo se confirma un pago cobrado.
    const paymentIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: `Payment is not completed in Stripe (status: ${paymentIntent.status})` },
        { status: 422 }
      );
    }

    // PASO 4: Llamar confirmOrder() (función compartida)
    const result = await confirmOrder(params.id);

    if (result === "confirmed") {
      await sendOrderConfirmation(params.id);
      return NextResponse.json({ success: true, result });
    }

    if (result === "already_processed") {
      // Otro actor la procesó: se informa el estado real, que puede no ser una compra confirmada.
      const { status } = await db.order.findUniqueOrThrow({ where: { id: params.id }, select: { status: true } });
      return NextResponse.json({ success: true, result, status });
    }

    if (result === "oversell") {
      // Sin stock: se reembolsa con el mismo flujo del webhook (plan MVP, sección F paso 7).
      // refund: CANCELLED_REFUNDED | REFUND_PENDING | OVERSELL_REFUND_FAILED | SKIPPED
      const refund = await handleOversell(params.id);
      const { status } = await db.order.findUniqueOrThrow({ where: { id: params.id }, select: { status: true } });
      return NextResponse.json({ success: true, result, refund, status });
    }
  } catch (err) {
    console.error(`[confirm-payment] orden ${params.id}:`, err);
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
