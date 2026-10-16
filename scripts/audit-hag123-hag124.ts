// Verificación aislada: no conecta a PostgreSQL, Stripe ni Resend, ni envía emails.
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

async function main() {
  process.env.STRIPE_SECRET_KEY = "sk_test_audit_offline";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_audit_offline";
  process.env.NEXTAUTH_URL = "https://supply.hagpartner.com";
  delete process.env.RESEND_API_KEY;
  delete process.env.ORDER_NOTIFY_EMAIL;
  delete process.env.ADMIN_ALERT_EMAIL;
  const { db } = await import("../lib/db");
  const { stripe } = await import("../lib/stripe");
  const { POST } = await import("../app/api/webhooks/stripe/route");
  const { handleStripeEvent } = await import("../lib/stripe-webhook");
  const { enqueueOrderEmails } = await import("../lib/order-emails");
  const { appOrigin } = await import("../lib/app-origin");
  const rows = new Map<string, Record<string, unknown>>();
  const createMany = async ({ data }: { data: Record<string, unknown>[] }) => {
    let count = 0;
    for (const row of data) {
      const key = String(row.dedupeKey);
      if (!rows.has(key)) { rows.set(key, row); count++; }
    }
    return { count };
  };
  const originalOrder = db.order.findUnique;
  const originalOutbox = { createMany: db.emailOutbox.createMany, findMany: db.emailOutbox.findMany };
  Object.assign(db.order, { findUnique: async ({ where }: { where: { stripePaymentIntentId: string } }) =>
    where.stripePaymentIntentId === "pi_linked" ? { id: "linked", status: "PAYMENT_CONFIRMED" } : null });
  Object.assign(db.emailOutbox, { createMany, findMany: async () => [] });
  try {
    const event = (id: string, origin?: string): Stripe.Event => ({
      id: `evt_${id}`, type: "payment_intent.succeeded", livemode: false,
      data: { object: { id, status: "succeeded", metadata: origin ? { origin } : {} } },
    }) as Stripe.Event;
    for (const [id, origin, action, alerts] of [
      ["pi_foreign", "localhost:3000", "ignored:foreign_origin", 0],
      ["pi_own", "supply.hagpartner.com", "orphan_payment", 1],
      ["pi_legacy", undefined, "orphan_payment", 2],
      ["pi_linked", "localhost:3000", "skipped:PAYMENT_CONFIRMED", 2],
    ] as const) {
      const e = event(id, origin);
      assert.equal((await handleStripeEvent(e)).action, action);
      const payload = JSON.stringify(e);
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
      assert.equal((await POST(new Request("http://localhost/api/webhooks/stripe", {
        method: "POST", body: payload, headers: { "stripe-signature": signature },
      }))).status, 200);
      assert.equal(rows.size, alerts);
    }
    console.log("OK HAG-124: origen ajeno, propio, ausente y pago asociado; POST firmado, dedupe y conteos.");
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    assert.equal(appOrigin(), "localhost:3000");
    process.env.NEXTAUTH_URL = "https://supply.hagpartner.com/";
    assert.equal(appOrigin(), "supply.hagpartner.com");

    const decimal = (n: number) => new Prisma.Decimal(n);
    const order = {
      id: "order_audit", orderNumber: "AUDIT-123", createdAt: new Date("2026-10-16T14:00:00Z"),
      buyerName: "Ana <script>bad</script>", buyerEmail: "buyer@example.invalid",
      subtotal: decimal(25), shippingCost: decimal(0), total: decimal(25),
      shippingName: "Ana", shippingLine1: "1 Ocean Dr", shippingLine2: "Apt 4",
      shippingCity: "Miami", shippingState: "FL", shippingZip: "33139",
      items: [{ productName: "Taza <b>roja</b>", quantity: 2, unitPrice: decimal(12.5), total: decimal(25), product: { media: [] } }],
    };
    const tx = { order: { findUniqueOrThrow: async () => order }, emailOutbox: { createMany } } as unknown as Prisma.TransactionClient;
    for (const expected of ["alertas@hagpartner.com", "admin@example.invalid", "ventas@example.invalid"]) {
      rows.clear();
      if (expected.startsWith("admin")) process.env.ADMIN_ALERT_EMAIL = expected;
      if (expected.startsWith("ventas")) process.env.ORDER_NOTIFY_EMAIL = expected;
      await enqueueOrderEmails(tx, order.id);
      await enqueueOrderEmails(tx, order.id);
      assert.equal(rows.size, 2);
      const buyer = rows.get(`order-confirmation:${order.id}`)!;
      const owner = rows.get(`admin:new-order:${order.id}`)!;
      assert.equal(buyer.to, order.buyerEmail);
      assert.equal(owner.to, expected);
      assert.equal(owner.kind, "ADMIN_NEW_ORDER");
      assert.equal(owner.subject, "[HAG Supply] New order AUDIT-123 — $25.00");
      const html = String(owner.html);
      assert.ok(html.includes("&lt;b&gt;roja&lt;/b&gt;") && html.includes("&lt;script&gt;"));
      assert.ok(!html.includes("<script>"));
      assert.ok(html.includes("/admin/orders/order_audit") && html.includes("2 × $12.50"));
      assert.ok(String(owner.text).includes("Total: $25.00"));
    }
    console.log("OK HAG-123: dos emails, claves distintas, dedupe, tres destinatarios y plantilla escapada.");
  } finally {
    Object.assign(db.order, { findUnique: originalOrder });
    Object.assign(db.emailOutbox, originalOutbox);
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
