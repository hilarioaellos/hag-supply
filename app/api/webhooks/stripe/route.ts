import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/stripe-webhook";

// POST /api/webhooks/stripe — sin sesión; la autenticidad la da la firma de Stripe (plan MVP, sección D).
// 200: procesado o ignorado de forma idempotente. 400: firma inválida. 5xx: fallo transitorio, Stripe reintenta.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Configuración incompleta: 500 para que Stripe siga reintentando hasta que se cargue el secreto.
    console.error("[stripe-webhook] falta STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // La firma se calcula sobre el cuerpo crudo: se lee como texto, sin parsear antes.
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event);
    console.info(`[stripe-webhook] ${event.type} ${event.id} → ${outcome.action}${outcome.orderId ? ` (orden ${outcome.orderId})` : ""}`);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[stripe-webhook] ${event.type} ${event.id} falló:`, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Temporary failure" }, { status: 500 });
  }
}
