// Pruebas de integración del checkout (HAG-92 confirmOrder + HAG-93 startCheckout + oversell).
// Las de carreras y estados de refund envuelven el cliente de Stripe (pausas y respuestas simuladas);
// el resto usa Stripe test real.
// Usan una base PostgreSQL LOCAL desechable y Stripe en MODO TEST (PaymentIntents y refunds reales de prueba).
//
// Uso (la base debe tener el esquema: `prisma db push` + prisma/migrations/20261015000000_*/migration.sql):
//   DATABASE_URL=postgresql://...@localhost:PUERTO/db DIRECT_URL=<igual> npx tsx scripts/test-checkout.ts
//
// Se niega a correr contra una base que no sea localhost o con una clave de Stripe que no sea sk_test_.
// BORRA todos los datos de la base indicada.
import { config } from "dotenv";
import assert from "node:assert/strict";

config({ path: ".env.local" }); // solo aporta STRIPE_SECRET_KEY: no pisa DATABASE_URL ya exportada

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(dbUrl) || process.env.DIRECT_URL !== dbUrl) {
  console.error("✗ DATABASE_URL y DIRECT_URL deben apuntar a la MISMA base en localhost. Abortado.");
  process.exit(1);
}
// HAG-124: la cuenta de Stripe de prueba es compartida con producción. Los pagos de la suite llevan
// metadata.origin = host de NEXTAUTH_URL, y producción ignora los de otro origen. Sin un origen local válido y
// distinto del de producción, los pagos de la suite generarían avisos falsos en producción: no se corre.
const testOrigin = (() => {
  try {
    return new URL(process.env.NEXTAUTH_URL ?? "").host;
  } catch {
    return "";
  }
})();
if (!testOrigin || testOrigin === "supply.hagpartner.com") {
  console.error(`✗ NEXTAUTH_URL debe ser una URL local válida y distinta de producción (actual: "${process.env.NEXTAUTH_URL ?? ""}"). Abortado.`);
  process.exit(1);
}
if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
  console.error("✗ STRIPE_SECRET_KEY debe ser una clave de prueba (sk_test_). Abortado.");
  process.exit(1);
}

type Lib = {
  db: typeof import("@/lib/db").db;
  stripe: typeof import("@/lib/stripe").stripe;
  confirmOrder: typeof import("@/lib/confirm-order").confirmOrder;
  startCheckout: typeof import("@/lib/checkout").startCheckout;
  validateShipping: typeof import("@/lib/checkout").validateShipping;
  handleOversell: typeof import("@/lib/oversell").handleOversell;
  reconcileOrderPayment: typeof import("@/lib/checkout").reconcileOrderPayment;
  handleStripeEvent: typeof import("@/lib/stripe-webhook").handleStripeEvent;
  webhookPOST: typeof import("@/app/api/webhooks/stripe/route").POST;
  emails: typeof import("@/lib/order-emails");
  templates: typeof import("@/lib/email-templates");
  cronGET: typeof import("@/app/api/cron/email-outbox/route").GET;
  cancelAndRefund: typeof import("@/lib/order-cancel").cancelAndRefund;
  markRefundedManually: typeof import("@/lib/order-cancel").markRefundedManually;
  orderStatus: typeof import("@/lib/order-status");
};

// Secreto de firma SOLO para estas pruebas: los eventos se firman localmente con generateTestHeaderString.
const TEST_WEBHOOK_SECRET = "whsec_test_local_only";
process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
// Nunca enviar emails reales desde las pruebas: sin clave, el envío por Resend queda "no configurado".
delete process.env.RESEND_API_KEY;
delete process.env.ADMIN_ALERT_EMAIL; // las pruebas verifican el destinatario por defecto
delete process.env.ORDER_NOTIFY_EMAIL;
process.env.CRON_SECRET = "cron_test_local_only";

const SHIPPING = { name: "Test Buyer", line1: "100 Main St", line2: null, city: "Miami", state: "FL", zip: "33101" };
let passed = 0;

// TEST_ONLY=<regex>: corre solo las pruebas cuyo nombre coincide (p. ej. para no confirmar pagos en Stripe).
const only = process.env.TEST_ONLY ? new RegExp(process.env.TEST_ONLY) : null;
let skipped = 0;

async function test(name: string, fn: () => Promise<void>) {
  if (only && !only.test(name)) {
    skipped++;
    return;
  }
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}\n`, error);
    process.exitCode = 1;
  }
}

async function main() {
  const lib: Lib = {
    db: (await import("@/lib/db")).db,
    stripe: (await import("@/lib/stripe")).stripe,
    confirmOrder: (await import("@/lib/confirm-order")).confirmOrder,
    startCheckout: (await import("@/lib/checkout")).startCheckout,
    validateShipping: (await import("@/lib/checkout")).validateShipping,
    handleOversell: (await import("@/lib/oversell")).handleOversell,
    reconcileOrderPayment: (await import("@/lib/checkout")).reconcileOrderPayment,
    handleStripeEvent: (await import("@/lib/stripe-webhook")).handleStripeEvent,
    webhookPOST: (await import("@/app/api/webhooks/stripe/route")).POST,
    emails: await import("@/lib/order-emails"),
    templates: await import("@/lib/email-templates"),
    cronGET: (await import("@/app/api/cron/email-outbox/route")).GET,
    cancelAndRefund: (await import("@/lib/order-cancel")).cancelAndRefund,
    markRefundedManually: (await import("@/lib/order-cancel")).markRefundedManually,
    orderStatus: await import("@/lib/order-status"),
  };
  const { db, stripe } = lib;

  // ── Datos base ──
  await db.$executeRawUnsafe(`TRUNCATE "EmailOutbox", "OrderItem", "Order", "CartItem", "ProductMedia", "Product", "Category", "User" CASCADE`);
  const category = await db.category.create({ data: { name: "Test", slug: "test" } });
  const mk = (sku: string, price: number, stock: number) =>
    db.product.create({ data: { name: `Producto ${sku}`, slug: sku.toLowerCase(), description: "x", sku, price, stock, categoryId: category.id } });
  let n = 0;
  const newUser = () => db.user.create({ data: { email: `buyer${++n}@test.local`, name: `Buyer ${n}`, passwordHash: "x" } });
  const cart = (userId: string, items: { productId: string; quantity: number }[]) =>
    db.cartItem.createMany({ data: items.map((i) => ({ ...i, userId })) });
  const stockOf = async (id: string) => (await db.product.findUniqueOrThrow({ where: { id } })).stock;
  const orderOf = (id: string) => db.order.findUniqueOrThrow({ where: { id } });
  const pay = (paymentIntentId: string) =>
    stripe.paymentIntents.confirm(paymentIntentId, { payment_method: "pm_card_visa", return_url: "https://example.com/return" });

  console.log("\nHAG-92 — confirmOrder");

  await test("doble llamada concurrente: un solo 'confirmed', un solo decremento, carrito vacío", async () => {
    const user = await newUser();
    const p = await mk("C1", 10, 5);
    await cart(user.id, [{ productId: p.id, quantity: 2 }]);
    const order = await db.order.create({
      data: {
        orderNumber: "T-C1", userId: user.id, buyerEmail: user.email, buyerName: user.name, subtotal: 20, total: 20,
        items: { create: [{ productId: p.id, productName: p.name, quantity: 2, unitPrice: 10, total: 20 }] },
      },
    });
    const results = await Promise.all([lib.confirmOrder(order.id), lib.confirmOrder(order.id)]);
    assert.deepEqual([...results].sort(), ["already_processed", "confirmed"]);
    assert.equal(await stockOf(p.id), 3);
    assert.equal((await orderOf(order.id)).status, "PAYMENT_CONFIRMED");
    assert.equal(await db.cartItem.count({ where: { userId: user.id } }), 0);
  });

  await test("stock insuficiente: 'oversell' y rollback completo (estado, stock y carrito intactos)", async () => {
    const user = await newUser();
    const ok = await mk("C2A", 10, 5);
    const low = await mk("C2B", 10, 1);
    await cart(user.id, [{ productId: ok.id, quantity: 1 }, { productId: low.id, quantity: 2 }]);
    const order = await db.order.create({
      data: {
        orderNumber: "T-C2", userId: user.id, buyerEmail: user.email, buyerName: user.name, subtotal: 30, total: 30,
        items: {
          create: [
            { productId: ok.id, productName: ok.name, quantity: 1, unitPrice: 10, total: 10 },
            { productId: low.id, productName: low.name, quantity: 2, unitPrice: 10, total: 20 },
          ],
        },
      },
    });
    assert.equal(await lib.confirmOrder(order.id), "oversell");
    assert.equal((await orderOf(order.id)).status, "PENDING_PAYMENT");
    assert.equal(await stockOf(ok.id), 5, "el primer item no debe quedar decrementado");
    assert.equal(await stockOf(low.id), 1);
    assert.equal(await db.cartItem.count({ where: { userId: user.id } }), 2);
  });

  console.log("\nHAG-93 — validación de dirección");

  await test("validateShipping acepta una dirección válida y normaliza el estado", async () => {
    const r = lib.validateShipping({ ...SHIPPING, state: "fl", zip: "33101-1234", line2: "  " });
    assert.ok(r.ok);
    assert.equal(r.ok && r.value.state, "FL");
    assert.equal(r.ok && r.value.line2, null);
  });

  await test("validateShipping rechaza estado, ZIP y nombre inválidos", async () => {
    const r = lib.validateShipping({ ...SHIPPING, name: "", state: "XX", zip: "3310" });
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(!r.ok ? r.errors : {}).sort(), ["name", "state", "zip"]);
  });

  console.log("\nHAG-93 — startCheckout (Stripe test)");

  await test("carrito vacío → 400", async () => {
    const user = await newUser();
    const r = await lib.startCheckout(user.id, SHIPPING);
    assert.deepEqual(r, { kind: "error", status: 400, message: "Your cart is empty." });
  });

  await test("stock insuficiente o producto oculto → 409, sin crear orden", async () => {
    const user = await newUser();
    const p = await mk("S1", 10, 1);
    await cart(user.id, [{ productId: p.id, quantity: 2 }]);
    const r1 = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(r1.kind === "error" && r1.status, 409);
    await db.cartItem.updateMany({ where: { userId: user.id }, data: { quantity: 1 } });
    await db.product.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    const r2 = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(r2.kind === "error" && r2.status, 409);
    assert.equal(await db.order.count({ where: { userId: user.id } }), 0);
  });

  let caseA: { userId: string; orderId: string; paymentIntentId: string; productId: string } | null = null;

  await test("CASO A: crea orden PENDING_PAYMENT + PaymentIntent con el total del servidor; no toca stock", async () => {
    const user = await newUser();
    const a = await mk("A1", 24.99, 10);
    const b = await mk("A2", 5.5, 3);
    await cart(user.id, [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 1 }]);
    const r = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(r.kind, "payment");
    if (r.kind !== "payment") return;
    assert.equal(r.total, "55.48");
    assert.match(r.orderNumber, /^HAG-\d{8}-[0-9A-Z]{8}$/);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });
    assert.equal(order.status, "PENDING_PAYMENT");
    assert.equal(order.total.toFixed(2), "55.48");
    assert.equal(order.items.length, 2);
    assert.equal(order.shippingState, "FL");
    const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId!);
    assert.equal(pi.amount, 5548);
    assert.equal(pi.currency, "usd");
    assert.equal(pi.metadata.orderId, order.id);
    assert.equal(await stockOf(a.id), 10);
    caseA = { userId: user.id, orderId: order.id, paymentIntentId: pi.id, productId: a.id };
  });

  await test("CASO B (PaymentIntent sin pagar): cancela en Stripe, orden previa CANCELLED, crea otra", async () => {
    assert.ok(caseA);
    const r = await lib.startCheckout(caseA.userId, SHIPPING);
    assert.equal(r.kind, "payment");
    if (r.kind !== "payment") return;
    assert.notEqual(r.orderId, caseA.orderId);
    assert.equal((await orderOf(caseA.orderId)).status, "CANCELLED");
    assert.equal((await stripe.paymentIntents.retrieve(caseA.paymentIntentId)).status, "canceled");
    const fresh = await orderOf(r.orderId);
    caseA = { ...caseA, orderId: fresh.id, paymentIntentId: fresh.stripePaymentIntentId! };
  });

  await test("CASO B (PaymentIntent pagado): confirma la orden, descuenta stock, vacía carrito, no crea otra", async () => {
    assert.ok(caseA);
    assert.equal((await pay(caseA.paymentIntentId)).status, "succeeded");
    const ordersBefore = await db.order.count({ where: { userId: caseA.userId } });
    const r = await lib.startCheckout(caseA.userId, SHIPPING);
    assert.deepEqual(r, { kind: "paid", orderId: caseA.orderId });
    assert.equal((await orderOf(caseA.orderId)).status, "PAYMENT_CONFIRMED");
    assert.equal(await stockOf(caseA.productId), 8);
    assert.equal(await db.cartItem.count({ where: { userId: caseA.userId } }), 0);
    assert.equal(await db.order.count({ where: { userId: caseA.userId } }), ordersBefore);
  });

  await test("CASO B (pagado pero sin stock): oversell → refund en Stripe → CANCELLED_REFUNDED; idempotente", async () => {
    const user = await newUser();
    const p = await mk("O1", 12, 4);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const r1 = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(r1.kind, "payment");
    if (r1.kind !== "payment") return;
    const order = await orderOf(r1.orderId);
    await pay(order.stripePaymentIntentId!);
    await db.product.update({ where: { id: p.id }, data: { stock: 0 } }); // otro cliente compró el último
    const r2 = await lib.startCheckout(user.id, SHIPPING);
    assert.deepEqual(r2, { kind: "error", status: 409, message: "The item became unavailable and your payment is being refunded." });
    const after = await orderOf(order.id);
    assert.equal(after.status, "CANCELLED_REFUNDED");
    assert.ok(after.stripeRefundId);
    const refunds = await stripe.refunds.list({ payment_intent: order.stripePaymentIntentId! });
    assert.equal(refunds.data.length, 1);
    assert.equal(refunds.data[0].metadata?.orderId, order.id);
    assert.equal(await lib.handleOversell(order.id), "SKIPPED");
    assert.equal((await stripe.refunds.list({ payment_intent: order.stripePaymentIntentId! })).data.length, 1);
    assert.equal(await stockOf(p.id), 0);
  });

  await test("oversell: reintento tras caída con refund ya creado en Stripe → lo reutiliza (no duplica)", async () => {
    const user = await newUser();
    const p = await mk("O2", 9, 2);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const r = await lib.startCheckout(user.id, SHIPPING);
    if (r.kind !== "payment") throw new Error(JSON.stringify(r));
    const order = await orderOf(r.orderId);
    await pay(order.stripePaymentIntentId!);
    // Simula: refund creado en Stripe pero el proceso murió antes de guardarlo localmente.
    await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId!, metadata: { orderId: order.id, orderNumber: order.orderNumber } });
    await db.order.update({ where: { id: order.id }, data: { status: "OVERSELL_REFUND_PENDING" } });
    assert.equal(await lib.handleOversell(order.id), "CANCELLED_REFUNDED");
    assert.equal((await stripe.refunds.list({ payment_intent: order.stripePaymentIntentId! })).data.length, 1);
  });

  await test("CASO C: orden previa sin PaymentIntent y abandonada (> 2 min) → CANCELLED y se crea una nueva", async () => {
    const user = await newUser();
    const p = await mk("CC1", 7, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const stale = await db.order.create({
      data: {
        orderNumber: "T-CC1", userId: user.id, buyerEmail: user.email, buyerName: user.name, subtotal: 7, total: 7,
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });
    const r = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(r.kind, "payment");
    assert.equal((await orderOf(stale.id)).status, "CANCELLED");
  });

  await test("CASO C reciente (< 2 min, puede estar esperando a Stripe) → 409 y NO se cancela", async () => {
    const user = await newUser();
    const p = await mk("CC2", 7, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const young = await db.order.create({
      data: { orderNumber: "T-CC2", userId: user.id, buyerEmail: user.email, buyerName: user.name, subtotal: 7, total: 7 },
    });
    const r = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(r.kind === "error" && r.status, 409);
    assert.equal((await orderOf(young.id)).status, "PENDING_PAYMENT");
  });

  await test("CASO D (expirada > 30 min, sin pagar): misma lógica del caso B", async () => {
    const user = await newUser();
    const p = await mk("D1", 8, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const r1 = await lib.startCheckout(user.id, SHIPPING);
    if (r1.kind !== "payment") throw new Error(JSON.stringify(r1));
    await db.$executeRawUnsafe(`UPDATE "Order" SET "updatedAt" = now() - interval '45 minutes' WHERE id = $1`, r1.orderId);
    const r2 = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(r2.kind, "payment");
    assert.equal((await orderOf(r1.orderId)).status, "CANCELLED");
  });

  await test("dos checkouts simultáneos del mismo usuario: nunca dos órdenes PENDING_PAYMENT", async () => {
    const user = await newUser();
    const p = await mk("P1", 6, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const results = await Promise.all([lib.startCheckout(user.id, SHIPPING), lib.startCheckout(user.id, SHIPPING)]);
    assert.ok(results.some((r) => r.kind === "payment"), JSON.stringify(results));
    assert.equal(await db.order.count({ where: { userId: user.id, status: "PENDING_PAYMENT" } }), 1);
  });

  await test("Stripe rechaza el PaymentIntent (monto < $0.50) → orden CANCELLED y 500", async () => {
    const user = await newUser();
    const p = await mk("F1", 0.1, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const r = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(r.kind === "error" && r.status, 500);
    const order = await db.order.findFirstOrThrow({ where: { userId: user.id } });
    assert.equal(order.status, "CANCELLED");
    assert.equal(order.stripePaymentIntentId, null);
  });

  // ── Cliente de Stripe envuelto: reemplaza solo algunos métodos; el resto llama al Stripe de prueba real ──
  type Client = typeof stripe;
  const wrap = (over: { paymentIntents?: Record<string, unknown>; refunds?: Record<string, unknown> }): Client =>
    new Proxy(stripe, {
      get(target, key) {
        if (key === "paymentIntents" && over.paymentIntents) return Object.assign(Object.create(target.paymentIntents), over.paymentIntents);
        if (key === "refunds" && over.refunds) return Object.assign(Object.create(target.refunds), over.refunds);
        return Reflect.get(target, key);
      },
    });
  const gate = () => {
    let open!: () => void;
    let entered!: () => void;
    const opened = new Promise<void>((r) => (open = r));
    const reached = new Promise<void>((r) => (entered = r));
    return { open, entered, opened, reached };
  };
  // Cliente cuya creación de PaymentIntent se queda esperando dentro de Stripe hasta abrir la compuerta.
  const pausedClient = (g: ReturnType<typeof gate>, created: { id?: string }) =>
    wrap({
      paymentIntents: {
        create: async (...args: Parameters<Client["paymentIntents"]["create"]>) => {
          const pi = await stripe.paymentIntents.create(...args);
          created.id = pi.id;
          g.entered();
          await g.opened;
          return pi;
        },
      },
    });

  console.log("\nNO-GO v1 · Bloqueante — carrera al crear el PaymentIntent");

  await test("A pausada en Stripe + B en paralelo → B recibe 409 y NO cancela la orden de A; A termina bien", async () => {
    const user = await newUser();
    const p = await mk("R1", 15, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const g = gate();
    const created: { id?: string } = {};
    const aPromise = lib.startCheckout(user.id, SHIPPING, pausedClient(g, created));
    await g.reached;
    const b = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(b.kind === "error" && b.status, 409, JSON.stringify(b));
    g.open();
    const a = await aPromise;
    assert.equal(a.kind, "payment");
    if (a.kind !== "payment") return;
    const order = await orderOf(a.orderId);
    assert.equal(order.status, "PENDING_PAYMENT");
    assert.equal(order.stripePaymentIntentId, created.id);
  });

  await test("A pausada + su orden pasa a abandonada + B la cancela y crea otra → A NO devuelve clientSecret y cancela su PaymentIntent", async () => {
    const user = await newUser();
    const p = await mk("R2", 15, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const g = gate();
    const created: { id?: string } = {};
    const aPromise = lib.startCheckout(user.id, SHIPPING, pausedClient(g, created));
    await g.reached;
    const aOrder = await db.order.findFirstOrThrow({ where: { userId: user.id, status: "PENDING_PAYMENT" } });
    await db.$executeRawUnsafe(`UPDATE "Order" SET "createdAt" = now() - interval '5 minutes' WHERE id = $1`, aOrder.id);
    const b = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(b.kind, "payment", JSON.stringify(b));
    g.open();
    const a = await aPromise;
    assert.equal(a.kind, "error", "A no debe devolver un pago para una orden cancelada");
    assert.equal(a.kind === "error" && a.status, 409);
    const aAfter = await orderOf(aOrder.id);
    assert.equal(aAfter.status, "CANCELLED");
    assert.equal(aAfter.stripePaymentIntentId, null);
    assert.equal((await stripe.paymentIntents.retrieve(created.id!)).status, "canceled");
    if (b.kind !== "payment") return;
    const bOrder = await orderOf(b.orderId);
    assert.equal(bOrder.status, "PENDING_PAYMENT");
    assert.notEqual(bOrder.stripePaymentIntentId, created.id);
    // Invariante: todo clientSecret devuelto corresponde a una orden PENDING_PAYMENT con ese PaymentIntent.
    assert.ok(b.clientSecret.startsWith(`${bOrder.stripePaymentIntentId}_secret_`));
  });

  console.log("\nNO-GO v1 · Mayor — estados reales del refund");

  // Orden en oversell con un PaymentIntent ficticio: todas las llamadas a Stripe las responde el cliente falso.
  const oversellOrder = async (tag: string) => {
    const user = await newUser();
    const p = await mk(tag, 10, 0);
    return db.order.create({
      data: {
        orderNumber: `T-${tag}`, userId: user.id, buyerEmail: user.email, buyerName: user.name, subtotal: 10, total: 10,
        stripePaymentIntentId: `pi_fake_${tag}`,
        items: { create: [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 10, total: 10 }] },
      },
    });
  };
  const refundObj = (id: string, status: string, orderId: string) => ({ id, object: "refund", status, metadata: { orderId } });

  await test("refund `pending` → queda OVERSELL_REFUND_PENDING con stripeRefundId; luego `succeeded` vía retrieve → CANCELLED_REFUNDED sin crear otro", async () => {
    const order = await oversellOrder("RF1");
    let creates = 0;
    let status = "pending";
    const client = wrap({
      refunds: {
        list: async () => ({ data: [] }),
        create: async () => (creates++, refundObj("re_RF1", status, order.id)),
        retrieve: async (id: string) => refundObj(id, status, order.id),
      },
    });
    assert.equal(await lib.handleOversell(order.id, client), "REFUND_PENDING");
    let o = await orderOf(order.id);
    assert.equal(o.status, "OVERSELL_REFUND_PENDING");
    assert.equal(o.stripeRefundId, "re_RF1");
    status = "succeeded";
    assert.equal(await lib.handleOversell(order.id, client), "CANCELLED_REFUNDED");
    o = await orderOf(order.id);
    assert.equal(o.status, "CANCELLED_REFUNDED");
    assert.equal(creates, 1, "la recuperación usa el stripeRefundId guardado, no crea otro refund");
  });

  await test("refund `requires_action` → OVERSELL_REFUND_PENDING (aviso al admin), no se da por reembolsado", async () => {
    const order = await oversellOrder("RF2");
    const client = wrap({
      refunds: { list: async () => ({ data: [] }), create: async () => refundObj("re_RF2", "requires_action", order.id) },
    });
    assert.equal(await lib.handleOversell(order.id, client), "REFUND_PENDING");
    const o = await orderOf(order.id);
    assert.equal(o.status, "OVERSELL_REFUND_PENDING");
    assert.equal(o.stripeRefundId, "re_RF2");
  });

  await test("refund `failed` y `canceled` → OVERSELL_REFUND_FAILED", async () => {
    for (const st of ["failed", "canceled"]) {
      const order = await oversellOrder(`RF3${st}`);
      const client = wrap({ refunds: { list: async () => ({ data: [] }), create: async () => refundObj(`re_${st}`, st, order.id) } });
      assert.equal(await lib.handleOversell(order.id, client), "OVERSELL_REFUND_FAILED");
      assert.equal((await orderOf(order.id)).status, "OVERSELL_REFUND_FAILED");
    }
  });

  await test("refund con stripeRefundId ya guardado y estado `failed` en Stripe → OVERSELL_REFUND_FAILED (se consulta, no se asume)", async () => {
    const order = await oversellOrder("RF4");
    await db.order.update({ where: { id: order.id }, data: { status: "OVERSELL_REFUND_PENDING", stripeRefundId: "re_RF4" } });
    const client = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "failed", order.id) } });
    assert.equal(await lib.handleOversell(order.id, client), "OVERSELL_REFUND_FAILED");
  });

  await test("error transitorio de Stripe al crear el refund → REFUND_ERROR y queda OVERSELL_REFUND_PENDING (no se marca fallido)", async () => {
    const order = await oversellOrder("RF5");
    const client = wrap({
      refunds: { list: async () => ({ data: [] }), create: async () => { throw new Error("ECONNRESET simulado"); } },
    });
    assert.equal(await lib.handleOversell(order.id, client), "REFUND_ERROR");
    const o = await orderOf(order.id);
    assert.equal(o.status, "OVERSELL_REFUND_PENDING");
    assert.equal(o.stripeRefundId, null);
  });

  console.log("\nNO-GO v1 · Mayor — `already_processed` con estado final distinto de pagada");

  // PaymentIntent "succeeded" ficticio; al consultarlo, otro actor cambia la orden a `racedTo`.
  const raced = async (tag: string, racedTo: string) => {
    const user = await newUser();
    const p = await mk(tag, 10, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const order = await db.order.create({
      data: {
        orderNumber: `T-${tag}`, userId: user.id, buyerEmail: user.email, buyerName: user.name, subtotal: 10, total: 10,
        stripePaymentIntentId: `pi_fake_${tag}`,
        items: { create: [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 10, total: 10 }] },
      },
    });
    const client = wrap({
      paymentIntents: {
        retrieve: async (id: string) => {
          await db.$executeRawUnsafe(`UPDATE "Order" SET status = $1::"OrderStatus" WHERE id = $2`, racedTo, order.id);
          return { id, object: "payment_intent", status: "succeeded" };
        },
      },
    });
    return { result: await lib.startCheckout(user.id, SHIPPING, client), order };
  };

  for (const st of ["OVERSELL_REFUND_PENDING", "CANCELLED_REFUNDED", "OVERSELL_REFUND_FAILED"]) {
    await test(`otro actor la pasó a ${st} → 409 de reembolso, NO 'paid'`, async () => {
      const { result } = await raced(`G${st.length}${st.slice(0, 3)}`, st);
      assert.equal(result.kind, "error", JSON.stringify(result));
      assert.equal(result.kind === "error" && result.status, 409);
      assert.match(result.kind === "error" ? result.message : "", /refund/);
    });
  }

  await test("otro actor la pasó a CANCELLED con el pago cobrado → 409 de revisión manual, NO 'paid' ni orden nueva", async () => {
    const { result, order } = await raced("GCAN", "CANCELLED");
    assert.equal(result.kind === "error" && result.status, 409);
    assert.equal(await db.order.count({ where: { userId: order.userId } }), 1);
  });

  await test("otro actor la confirmó (PAYMENT_CONFIRMED) → 'paid'", async () => {
    const { result, order } = await raced("GPAY", "PAYMENT_CONFIRMED");
    assert.deepEqual(result, { kind: "paid", orderId: order.id });
  });

  console.log("\nGO v2 · Observación menor — la orden deja de estar pendiente entre ambas lecturas");

  // Middleware de prueba: justo antes de la relectura de la orden (resolvePendingOrder), otro actor la
  // confirma y vacía el carrito, como haría el webhook. Solo se arma para una orden y una vez.
  let armedOrderId: string | null = null;
  db.$use(async (params, next) => {
    if (params.model === "Order" && params.action === "findUniqueOrThrow" && params.args?.where?.id === armedOrderId) {
      const id = armedOrderId!;
      armedOrderId = null;
      await db.$executeRawUnsafe(`UPDATE "Order" SET status = 'PAYMENT_CONFIRMED' WHERE id = $1`, id);
      await db.$executeRawUnsafe(`DELETE FROM "CartItem" WHERE "userId" = (SELECT "userId" FROM "Order" WHERE id = $1)`, id);
    }
    return next(params);
  });

  await test("confirmada por otro actor entre el findFirst y la relectura → 'paid' (no 'Your cart is empty')", async () => {
    const user = await newUser();
    const p = await mk("M1", 10, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const order = await db.order.create({
      data: {
        orderNumber: "T-M1", userId: user.id, buyerEmail: user.email, buyerName: user.name, subtotal: 10, total: 10,
        stripePaymentIntentId: "pi_fake_M1",
        items: { create: [{ productId: p.id, productName: p.name, quantity: 1, unitPrice: 10, total: 10 }] },
      },
    });
    armedOrderId = order.id;
    const r = await lib.startCheckout(user.id, SHIPPING);
    assert.equal(armedOrderId, null, "el middleware debió dispararse");
    assert.deepEqual(r, { kind: "paid", orderId: order.id });
  });

  console.log("\nHAG-94 — reconcileOrderPayment (retorno de Stripe a /order-confirmation)");

  const pendingWithPayment = async (tag: string, stock = 5) => {
    const user = await newUser();
    const p = await mk(tag, 20, stock);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const r = await lib.startCheckout(user.id, SHIPPING);
    if (r.kind !== "payment") throw new Error(JSON.stringify(r));
    return { user, product: p, order: await orderOf(r.orderId) };
  };

  await test("pago succeeded → PAYMENT_CONFIRMED, stock descontado, carrito vacío; segunda llamada idempotente", async () => {
    const { user, product, order } = await pendingWithPayment("H1");
    await pay(order.stripePaymentIntentId!);
    const r1 = await lib.reconcileOrderPayment(order.id);
    assert.deepEqual(r1, { status: "PAYMENT_CONFIRMED", paymentIntentStatus: "succeeded" });
    assert.equal(await stockOf(product.id), 4);
    assert.equal(await db.cartItem.count({ where: { userId: user.id } }), 0);
    const r2 = await lib.reconcileOrderPayment(order.id);
    assert.deepEqual(r2, { status: "PAYMENT_CONFIRMED", paymentIntentStatus: null });
    assert.equal(await stockOf(product.id), 4, "no se descuenta dos veces");
  });

  await test("pago sin completar (requires_payment_method) → sigue PENDING_PAYMENT y NO se cancela nada", async () => {
    const { order } = await pendingWithPayment("H2");
    const r = await lib.reconcileOrderPayment(order.id);
    assert.deepEqual(r, { status: "PENDING_PAYMENT", paymentIntentStatus: "requires_payment_method" });
    assert.equal((await stripe.paymentIntents.retrieve(order.stripePaymentIntentId!)).status, "requires_payment_method");
  });

  await test("tarjeta rechazada (pm_card_chargeDeclined) → sigue PENDING_PAYMENT, se puede reintentar", async () => {
    const { order } = await pendingWithPayment("H3");
    await stripe.paymentIntents
      .confirm(order.stripePaymentIntentId!, { payment_method: "pm_card_chargeDeclined", return_url: "https://example.com/r" })
      .catch(() => null);
    const r = await lib.reconcileOrderPayment(order.id);
    assert.equal(r.status, "PENDING_PAYMENT");
    assert.equal(r.paymentIntentStatus, "requires_payment_method");
  });

  await test("pagado pero sin stock al volver → refund real en Stripe → CANCELLED_REFUNDED", async () => {
    const { product, order } = await pendingWithPayment("H4", 1);
    await pay(order.stripePaymentIntentId!);
    await db.product.update({ where: { id: product.id }, data: { stock: 0 } });
    const r = await lib.reconcileOrderPayment(order.id);
    assert.equal(r.status, "CANCELLED_REFUNDED");
    assert.equal((await stripe.refunds.list({ payment_intent: order.stripePaymentIntentId! })).data.length, 1);
  });

  console.log("\nHAG-94 NO-GO v1 · Mayor 1 — recargar la confirmación retoma un refund pendiente");

  const refundsOf = async (paymentIntentId: string) => (await stripe.refunds.list({ payment_intent: paymentIntentId })).data;

  await test("refund `pending` real (pm_card_pendingRefund = 4000 0000 0000 7726): recargar reutiliza el mismo refund; al pasar a succeeded → CANCELLED_REFUNDED", async () => {
    const { product, order } = await pendingWithPayment("K1", 1);
    await stripe.paymentIntents.confirm(order.stripePaymentIntentId!, { payment_method: "pm_card_pendingRefund", return_url: "https://example.com/r" });
    await db.product.update({ where: { id: product.id }, data: { stock: 0 } });

    const first = await lib.reconcileOrderPayment(order.id);
    assert.equal(first.status, "OVERSELL_REFUND_PENDING");
    const saved = (await orderOf(order.id)).stripeRefundId;
    assert.ok(saved);
    assert.equal((await stripe.refunds.retrieve(saved!)).status, "pending");

    // Recarga: retoma el refund guardado, no crea otro.
    const reload = await lib.reconcileOrderPayment(order.id);
    assert.equal(reload.status, "OVERSELL_REFUND_PENDING");
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1);

    // Stripe lo concluye "más tarde": solo refunds.retrieve responde succeeded; todo lo demás es real.
    const later = wrap({ refunds: { retrieve: async (id: string) => ({ ...(await stripe.refunds.retrieve(id)), status: "succeeded" }) } });
    const done = await lib.reconcileOrderPayment(order.id, later);
    assert.equal(done.status, "CANCELLED_REFUNDED");
    assert.equal((await orderOf(order.id)).stripeRefundId, saved);
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1, "sin refunds duplicados");
  });

  await test("error transitorio al crear el refund → la recarga lo reintenta con éxito, un solo refund en Stripe", async () => {
    const { product, order } = await pendingWithPayment("K2", 1);
    await pay(order.stripePaymentIntentId!);
    await db.product.update({ where: { id: product.id }, data: { stock: 0 } });

    const flaky = wrap({ refunds: { create: async () => { throw new Error("ECONNRESET simulado"); } } });
    const first = await lib.reconcileOrderPayment(order.id, flaky);
    assert.equal(first.status, "OVERSELL_REFUND_PENDING");
    assert.equal((await orderOf(order.id)).stripeRefundId, null);
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 0);

    const retry = await lib.reconcileOrderPayment(order.id); // Stripe test real
    assert.equal(retry.status, "CANCELLED_REFUNDED");
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1);
    assert.equal((await lib.reconcileOrderPayment(order.id)).status, "CANCELLED_REFUNDED");
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1, "recargas posteriores no crean otro refund");
  });

  await test("(informativo) refund pending real sondeado hasta 90 s sin simulación", async () => {
    const { product, order } = await pendingWithPayment("K3", 1);
    await stripe.paymentIntents.confirm(order.stripePaymentIntentId!, { payment_method: "pm_card_pendingRefund", return_url: "https://example.com/r" });
    await db.product.update({ where: { id: product.id }, data: { stock: 0 } });
    let status = (await lib.reconcileOrderPayment(order.id)).status;
    const start = Date.now();
    while (status === "OVERSELL_REFUND_PENDING" && Date.now() - start < 90_000) {
      await new Promise((r) => setTimeout(r, 10_000));
      status = (await lib.reconcileOrderPayment(order.id)).status;
    }
    console.log(`      → tras ${Math.round((Date.now() - start) / 1000)} s: ${status}; refunds en Stripe: ${(await refundsOf(order.stripePaymentIntentId!)).length}`);
    assert.ok(["OVERSELL_REFUND_PENDING", "CANCELLED_REFUNDED"].includes(status));
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1);
  });

  await test("Stripe no responde → devuelve el estado actual sin tocar la orden", async () => {
    const { order } = await pendingWithPayment("H5");
    const down = wrap({ paymentIntents: { retrieve: async () => { throw new Error("timeout simulado"); } } });
    const r = await lib.reconcileOrderPayment(order.id, down);
    assert.deepEqual(r, { status: "PENDING_PAYMENT", paymentIntentStatus: null });
  });

  console.log("\nHAG-95 — webhook de Stripe");

  type AnyEvent = Parameters<Lib["handleStripeEvent"]>[0];
  let evtSeq = 0;
  const evt = (type: string, object: unknown) =>
    ({ id: `evt_test_${++evtSeq}`, object: "event", type, data: { object }, created: Math.floor(Date.now() / 1000), livemode: false }) as unknown as AnyEvent;
  // Llama a la ruta real con un cuerpo firmado (o con la firma indicada).
  const postWebhook = async (event: AnyEvent, signature?: string | null) => {
    const payload = JSON.stringify(event);
    const header = signature === undefined ? stripe.webhooks.generateTestHeaderString({ payload, secret: TEST_WEBHOOK_SECRET }) : signature;
    const req = new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: header === null ? {} : { "stripe-signature": header },
      body: payload,
    });
    const res = await lib.webhookPOST(req);
    return { status: res.status, body: await res.json() };
  };

  await test("firma: sin header → 400; firma inválida → 400; sin STRIPE_WEBHOOK_SECRET → 500; firma válida → 200", async () => {
    const e = evt("customer.created", { id: "cus_x" });
    assert.equal((await postWebhook(e, null)).status, 400);
    assert.equal((await postWebhook(e, "t=1,v1=deadbeef")).status, 400);
    const otherSecret = stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(e), secret: "whsec_otro" });
    assert.equal((await postWebhook(e, otherSecret)).status, 400, "firmado con otro secreto");
    delete process.env.STRIPE_WEBHOOK_SECRET;
    assert.equal((await postWebhook(e)).status, 500);
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    assert.deepEqual(await postWebhook(e), { status: 200, body: { received: true } });
  });

  await test("payment_intent.succeeded (pago real) → PAYMENT_CONFIRMED; evento duplicado → 200 idempotente, un solo decremento", async () => {
    const { user, product, order } = await pendingWithPayment("W1");
    const pi = await pay(order.stripePaymentIntentId!);
    const e = evt("payment_intent.succeeded", pi);
    assert.equal((await postWebhook(e)).status, 200);
    assert.equal((await orderOf(order.id)).status, "PAYMENT_CONFIRMED");
    assert.equal(await stockOf(product.id), 4);
    assert.equal(await db.cartItem.count({ where: { userId: user.id } }), 0);
    assert.equal((await postWebhook(e)).status, 200);
    assert.deepEqual(await lib.handleStripeEvent(e), { action: "skipped:PAYMENT_CONFIRMED", orderId: order.id });
    assert.equal(await stockOf(product.id), 4);
  });

  await test("payment_intent.succeeded sin stock → refund real con metadata → CANCELLED_REFUNDED; reenvío no duplica", async () => {
    const { product, order } = await pendingWithPayment("W2", 1);
    const pi = await pay(order.stripePaymentIntentId!);
    await db.product.update({ where: { id: product.id }, data: { stock: 0 } });
    const e = evt("payment_intent.succeeded", pi);
    assert.equal((await postWebhook(e)).status, 200);
    const after = await orderOf(order.id);
    assert.equal(after.status, "CANCELLED_REFUNDED");
    const refunds = await refundsOf(order.stripePaymentIntentId!);
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].metadata?.orderId, order.id);
    assert.equal(refunds[0].metadata?.orderNumber, order.orderNumber);
    assert.equal((await postWebhook(e)).status, 200);
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1);
  });

  await test("error transitorio al crear el refund → handleStripeEvent lanza (la ruta responde 5xx); el reintento lo completa con 1 refund", async () => {
    const { product, order } = await pendingWithPayment("W3", 1);
    const pi = await pay(order.stripePaymentIntentId!);
    await db.product.update({ where: { id: product.id }, data: { stock: 0 } });
    const e = evt("payment_intent.succeeded", pi);
    const flaky = wrap({ refunds: { create: async () => { throw new Error("ECONNRESET simulado"); } } });
    await assert.rejects(lib.handleStripeEvent(e, flaky));
    assert.equal((await orderOf(order.id)).status, "OVERSELL_REFUND_PENDING");
    // Stripe reenvía el evento: esta vez con el cliente real, por la ruta.
    assert.equal((await postWebhook(e)).status, 200);
    assert.equal((await orderOf(order.id)).status, "CANCELLED_REFUNDED");
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1);
  });

  await test("refund.updated: refund `pending` real (7726) sigue pendiente; al llegar `succeeded` → CANCELLED_REFUNDED", async () => {
    const { product, order } = await pendingWithPayment("W4", 1);
    const pi = await stripe.paymentIntents.confirm(order.stripePaymentIntentId!, { payment_method: "pm_card_pendingRefund", return_url: "https://example.com/r" });
    await db.product.update({ where: { id: product.id }, data: { stock: 0 } });
    assert.equal((await postWebhook(evt("payment_intent.succeeded", pi))).status, 200);
    const pending = await orderOf(order.id);
    assert.equal(pending.status, "OVERSELL_REFUND_PENDING");
    const refund = await stripe.refunds.retrieve(pending.stripeRefundId!);
    assert.equal(refund.status, "pending");
    assert.equal((await postWebhook(evt("refund.updated", refund))).status, 200);
    assert.equal((await orderOf(order.id)).status, "OVERSELL_REFUND_PENDING");
    // Stripe concluye el refund: evento refund.updated con status succeeded (retrieve simulado, igual que el evento).
    const later = wrap({ refunds: { retrieve: async (id: string) => ({ ...(await stripe.refunds.retrieve(id)), status: "succeeded" }) } });
    const outcome = await lib.handleStripeEvent(evt("refund.updated", { ...refund, status: "succeeded" }), later);
    assert.deepEqual(outcome, { action: "refund:CANCELLED_REFUNDED", orderId: order.id });
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1);
  });

  // Avisos al admin (HAG-103): filas ADMIN_ALERT de la bandeja de salida de esa orden.
  const alertsFor = (orderId: string) => db.emailOutbox.count({ where: { orderId, kind: "ADMIN_ALERT" } });
  // Stripe "dice" que el refund falló (lo que devuelve refunds.retrieve en ese momento).
  const refundFailedClient = (orderId: string) =>
    wrap({ refunds: { retrieve: async (id: string) => ({ ...refundObj(id, "failed", orderId), failure_reason: "expired_or_canceled_card" }) } });

  await test("refund.failed después de CANCELLED_REFUNDED → OVERSELL_REFUND_FAILED, 1 aviso; repetido → sin cambios ni otro aviso", async () => {
    const { product, order } = await pendingWithPayment("W5", 1);
    const pi = await pay(order.stripePaymentIntentId!);
    await db.product.update({ where: { id: product.id }, data: { stock: 0 } });
    await postWebhook(evt("payment_intent.succeeded", pi));
    const refunded = await orderOf(order.id);
    assert.equal(refunded.status, "CANCELLED_REFUNDED");
    const refund = await stripe.refunds.retrieve(refunded.stripeRefundId!);
    const failedEvt = evt("refund.failed", { ...refund, status: "failed" });
    const failing = refundFailedClient(order.id);
    assert.deepEqual(await lib.handleStripeEvent(failedEvt, failing), { action: "refund:OVERSELL_REFUND_FAILED", orderId: order.id });
    assert.equal((await orderOf(order.id)).status, "OVERSELL_REFUND_FAILED");
    assert.deepEqual(await lib.handleStripeEvent(failedEvt, failing), { action: "refund:SKIPPED", orderId: order.id });
    assert.equal(await alertsFor(order.id), 1);
  });

  console.log("\nHAG-95 NO-GO v1 · Mayor — refund `succeeded` y `failed` del MISMO refund en paralelo (PostgreSQL real)");

  // Orden en OVERSELL_REFUND_PENDING con refund guardado; Stripe lo controla el cliente de cada actor.
  const refundRaceOrder = async (tag: string) => {
    const order = await oversellOrder(tag);
    return db.order.update({ where: { id: order.id }, data: { status: "OVERSELL_REFUND_PENDING", stripeRefundId: `re_race_${tag}` } });
  };
  // Cliente cuyo refunds.retrieve se pausa (ya leída la orden por el handler) hasta abrir la compuerta.
  let refundCreates = 0;
  const pausedRefund = (status: string, orderId: string) => {
    const g = gate();
    const client = wrap({
      refunds: {
        retrieve: async (id: string) => {
          g.entered();
          await g.opened;
          return { ...refundObj(id, status, orderId), failure_reason: status === "failed" ? "expired_or_canceled_card" : null };
        },
        list: async () => ({ data: [] }),
        create: async () => { refundCreates++; throw new Error("no debe crearse otro refund"); },
      },
    });
    return { g, client };
  };
  const refundEvt = (type: string, refundId: string, orderId: string, status: string) =>
    evt(type, { id: refundId, object: "refund", status, metadata: { orderId } });

  await test("secuencia del auditor: A (refund.updated → succeeded) y B (refund.failed) leen pendiente; aplica A y luego B → OVERSELL_REFUND_FAILED, 1 aviso, 0 refunds nuevos", async () => {
    const order = await refundRaceOrder("RC1");
    refundCreates = 0;
    const a = pausedRefund("succeeded", order.id);
    const b = pausedRefund("failed", order.id);
    const aDone = lib.handleStripeEvent(refundEvt("refund.updated", order.stripeRefundId!, order.id, "succeeded"), a.client);
    await a.g.reached;
    const bDone = lib.handleStripeEvent(refundEvt("refund.failed", order.stripeRefundId!, order.id, "failed"), b.client);
    await b.g.reached;
    a.g.open();
    assert.deepEqual(await aDone, { action: "refund:CANCELLED_REFUNDED", orderId: order.id });
    assert.equal((await orderOf(order.id)).status, "CANCELLED_REFUNDED");
    b.g.open();
    assert.deepEqual(await bDone, { action: "refund:OVERSELL_REFUND_FAILED", orderId: order.id });
    assert.equal((await orderOf(order.id)).status, "OVERSELL_REFUND_FAILED");
    assert.equal(await alertsFor(order.id), 1);
    assert.equal(refundCreates, 0);
  });

  await test("orden inverso: aplica B (failed) y después A (succeeded atrasado) → sigue OVERSELL_REFUND_FAILED, 1 aviso", async () => {
    const order = await refundRaceOrder("RC2");
    refundCreates = 0;
    const a = pausedRefund("succeeded", order.id);
    const b = pausedRefund("failed", order.id);
    const aDone = lib.handleStripeEvent(refundEvt("refund.updated", order.stripeRefundId!, order.id, "succeeded"), a.client);
    await a.g.reached;
    const bDone = lib.handleStripeEvent(refundEvt("refund.failed", order.stripeRefundId!, order.id, "failed"), b.client);
    await b.g.reached;
    b.g.open();
    assert.deepEqual(await bDone, { action: "refund:OVERSELL_REFUND_FAILED", orderId: order.id });
    a.g.open();
    assert.deepEqual(await aDone, { action: "refund:SKIPPED", orderId: order.id });
    assert.equal((await orderOf(order.id)).status, "OVERSELL_REFUND_FAILED", "un succeeded atrasado no revierte el fallo");
    assert.equal(await alertsFor(order.id), 1);
    assert.equal(refundCreates, 0);
  });

  await test("misma carrera por el camino handleOversell (payment_intent.succeeded reenviado con la orden pendiente) + refund.failed → OVERSELL_REFUND_FAILED, 1 aviso", async () => {
    const order = await refundRaceOrder("RC3");
    refundCreates = 0;
    const a = pausedRefund("succeeded", order.id);
    const b = pausedRefund("failed", order.id);
    const piEvt = evt("payment_intent.succeeded", { id: order.stripePaymentIntentId, object: "payment_intent", status: "succeeded", metadata: { orderId: order.id } });
    const aDone = lib.handleStripeEvent(piEvt, a.client); // → handleOversell → retrieve del refund guardado
    await a.g.reached;
    const bDone = lib.handleStripeEvent(refundEvt("refund.failed", order.stripeRefundId!, order.id, "failed"), b.client);
    await b.g.reached;
    a.g.open();
    assert.deepEqual(await aDone, { action: "oversell:CANCELLED_REFUNDED", orderId: order.id });
    b.g.open();
    assert.deepEqual(await bDone, { action: "refund:OVERSELL_REFUND_FAILED", orderId: order.id });
    assert.equal((await orderOf(order.id)).status, "OVERSELL_REFUND_FAILED");
    assert.equal(await alertsFor(order.id), 1);
    assert.equal(refundCreates, 0);
  });

  await test("dos refund.failed del mismo refund en paralelo → OVERSELL_REFUND_FAILED con un solo aviso", async () => {
    const order = await refundRaceOrder("RC4");
    const b1 = pausedRefund("failed", order.id);
    const b2 = pausedRefund("failed", order.id);
    const e = refundEvt("refund.failed", order.stripeRefundId!, order.id, "failed");
    const d1 = lib.handleStripeEvent(e, b1.client);
    const d2 = lib.handleStripeEvent(e, b2.client);
    await Promise.all([b1.g.reached, b2.g.reached]);
    b1.g.open();
    b2.g.open();
    const actions = (await Promise.all([d1, d2])).map((r) => r.action).sort();
    assert.deepEqual(actions, ["refund:OVERSELL_REFUND_FAILED", "refund:SKIPPED"]);
    assert.equal(await alertsFor(order.id), 1);
  });

  await test("refund de OTRA orden con metadata ajena → ignorado, la orden no cambia", async () => {
    const order = await refundRaceOrder("RC5");
    const other = await refundRaceOrder("RC6");
    const e = evt("refund.failed", { id: order.stripeRefundId, object: "refund", status: "failed", metadata: { orderId: other.id } });
    const r = await lib.handleStripeEvent(e, refundFailedClient(other.id));
    // Se encuentra por stripeRefundId (orden RC5) aunque la metadata apunte a otra: aplica a la orden dueña del refund.
    assert.equal(r.orderId, order.id);
    assert.equal((await orderOf(other.id)).status, "OVERSELL_REFUND_PENDING");
  });

  await test("estado terminal (CANCELLED) + payment_intent.succeeded → no se toca; pago sin orden → 200 'orphan_payment'", async () => {
    const { order } = await pendingWithPayment("W6");
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId!);
    assert.deepEqual(await lib.handleStripeEvent(evt("payment_intent.succeeded", { ...pi, status: "succeeded" })), { action: "skipped:CANCELLED", orderId: order.id });
    const orphan = evt("payment_intent.succeeded", { id: "pi_orphan_test", object: "payment_intent", status: "succeeded", metadata: {} });
    assert.deepEqual(await postWebhook(orphan), { status: 200, body: { received: true } });
    assert.equal((await lib.handleStripeEvent(orphan)).action, "orphan_payment");
  });

  await test("refund ajeno (sin orden) y tipos de evento no manejados → ignorados con 200", async () => {
    assert.deepEqual(await lib.handleStripeEvent(evt("refund.updated", { id: "re_ajeno", object: "refund", status: "succeeded", metadata: {} })), { action: "ignored:refund_without_order" });
    assert.deepEqual(await postWebhook(evt("charge.succeeded", { id: "ch_x" })), { status: 200, body: { received: true } });
  });

  console.log("\nHAG-103 — emails con bandeja de salida durable");

  type Sent = Parameters<import("@/lib/order-emails").EmailSender>[0];
  // Proveedor falso: registra lo enviado; `fail` decide si responde con error.
  const fakeSender = (opts: { fail?: boolean; delayMs?: number } = {}) => {
    const sent: Sent[] = [];
    const sender = async (email: Sent) => {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (opts.fail) throw new Error("Resend: 503 simulado");
      sent.push(email);
      return { id: `msg_${sent.length}` };
    };
    return { sent, sender };
  };
  const confirmationOf = (orderId: string) => db.emailOutbox.findUnique({ where: { dedupeKey: `order-confirmation:${orderId}` } });
  const confirmedOrder = async (tag: string, name = `Producto ${tag}`) => {
    const user = await newUser();
    const p = await db.product.create({ data: { name, slug: tag.toLowerCase(), description: "x", sku: tag, price: 12.5, stock: 5, categoryId: category.id } });
    const order = await db.order.create({
      data: {
        orderNumber: `T-${tag}`, userId: user.id, buyerEmail: user.email, buyerName: "Ana María Pérez", subtotal: 25, total: 25,
        shippingName: "Ana María Pérez", shippingLine1: "1 Ocean Dr", shippingLine2: "Apt 4", shippingCity: "Miami", shippingState: "FL", shippingZip: "33139",
        items: { create: [{ productId: p.id, productName: name, quantity: 2, unitPrice: 12.5, total: 25 }] },
      },
    });
    return { user, product: p, order };
  };

  await test("confirmOrder encola la confirmación en la MISMA transacción; con oversell (rollback) no queda email", async () => {
    const { order } = await confirmedOrder("E1");
    assert.equal(await lib.confirmOrder(order.id), "confirmed");
    const email = await confirmationOf(order.id);
    assert.ok(email);
    assert.equal(email!.kind, "ORDER_CONFIRMATION");
    assert.equal(email!.status, "PENDING");
    assert.equal(email!.to, (await db.user.findUniqueOrThrow({ where: { id: order.userId } })).email);
    const { product, order: o2 } = await confirmedOrder("E1B");
    await db.product.update({ where: { id: product.id }, data: { stock: 1 } });
    assert.equal(await lib.confirmOrder(o2.id), "oversell");
    assert.equal(await confirmationOf(o2.id), null, "la transacción revertida no deja email");
  });

  await test("doble confirmOrder concurrente → una sola confirmación encolada", async () => {
    const { order } = await confirmedOrder("E2");
    await Promise.all([lib.confirmOrder(order.id), lib.confirmOrder(order.id)]);
    assert.equal(await db.emailOutbox.count({ where: { orderId: order.id, kind: "ORDER_CONFIRMATION" } }), 1);
  });

  await test("plantilla: número, items, total, dirección, enlace, Reply-To; escapa HTML del nombre del producto", async () => {
    const { order } = await confirmedOrder("E3", `Taza <script>alert(1)</script> & "Co"`);
    await lib.confirmOrder(order.id);
    const email = (await confirmationOf(order.id))!;
    assert.equal(email.subject, `Order confirmed — T-E3`);
    for (const piece of ["T-E3", "Thank you for your order, Ana!", "2 × $12.50", "$25.00", "1 Ocean Dr", "Apt 4", "Miami, FL 33139", `/order-confirmation/${order.id}`]) {
      assert.ok(email.html.includes(piece), `HTML sin "${piece}"`);
    }
    assert.ok(!email.html.includes("<script>"), "el HTML no debe contener el script sin escapar");
    assert.ok(email.html.includes("&lt;script&gt;"));
    assert.ok(email.text.includes("Order number: T-E3") && email.text.includes("Total: $25.00"));
    const { sent, sender } = fakeSender();
    assert.equal(await lib.emails.deliverEmail(email.id, sender), "sent");
    assert.equal(sent[0].from, "HAG Supply <orders@hagpartner.com>");
    assert.equal(sent[0].replyTo, "orders@hagpartner.com");
    assert.equal(sent[0].idempotencyKey, `order-confirmation:${order.id}`);
  });

  await test("envío OK → SENT con providerMessageId; reintento posterior no reenvía", async () => {
    const { order } = await confirmedOrder("E4");
    await lib.confirmOrder(order.id);
    const { sent, sender } = fakeSender();
    await lib.emails.sendOrderConfirmation(order.id, sender);
    const email = (await confirmationOf(order.id))!;
    assert.equal(email.status, "SENT");
    // Confirmación y aviso de venta se encolan juntos: el orden de envío entre ambos no está garantizado.
    assert.match(email.providerMessageId ?? "", /^msg_[12]$/);
    assert.ok(email.sentAt);
    await lib.emails.sendOrderConfirmation(order.id, sender);
    // Cada orden tiene 2 emails (confirmación + aviso de venta, HAG-123): la confirmación salió una sola vez.
    assert.equal(sent.filter((m) => m.idempotencyKey === `order-confirmation:${order.id}`).length, 1);
  });

  await test("sin RESEND_API_KEY → queda PENDING sin gastar intentos; al configurarse se envía", async () => {
    const { order } = await confirmedOrder("E5");
    await lib.confirmOrder(order.id);
    const email = (await confirmationOf(order.id))!;
    assert.equal(await lib.emails.deliverEmail(email.id), "not_configured");
    let after = (await confirmationOf(order.id))!;
    assert.equal(after.status, "PENDING");
    assert.equal(after.attempts, 0);
    const { sender } = fakeSender();
    assert.equal(await lib.emails.deliverEmail(email.id, sender), "sent");
    after = (await confirmationOf(order.id))!;
    assert.equal(after.status, "SENT");
    assert.equal(after.attempts, 1);
  });

  await test("fallo del proveedor → PENDING con espera creciente; tras 8 intentos → FAILED", async () => {
    const { order } = await confirmedOrder("E6");
    await lib.confirmOrder(order.id);
    const id = (await confirmationOf(order.id))!.id;
    const { sender } = fakeSender({ fail: true });
    assert.equal(await lib.emails.deliverEmail(id, sender), "retry");
    let e = (await confirmationOf(order.id))!;
    assert.equal(e.status, "PENDING");
    assert.equal(e.attempts, 1);
    assert.ok(e.nextAttemptAt.getTime() > Date.now() + 50_000, "espera ~1 min antes del próximo intento");
    assert.match(e.lastError ?? "", /503 simulado/);
    assert.equal(await lib.emails.deliverEmail(id, sender), "skipped", "no se reintenta antes de tiempo");
    for (let i = 2; i <= 8; i++) {
      await db.emailOutbox.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      assert.equal(await lib.emails.deliverEmail(id, sender), i < 8 ? "retry" : "failed");
    }
    e = (await confirmationOf(order.id))!;
    assert.equal(e.status, "FAILED");
    assert.equal(e.attempts, 8);
  });

  await test("dos entregas concurrentes del mismo email → el proveedor recibe UN envío", async () => {
    const { order } = await confirmedOrder("E7");
    await lib.confirmOrder(order.id);
    const id = (await confirmationOf(order.id))!.id;
    const { sent, sender } = fakeSender({ delayMs: 300 });
    const results = await Promise.all([lib.emails.deliverEmail(id, sender), lib.emails.deliverEmail(id, sender), lib.emails.deliverPending({ orderId: order.id, sender })]);
    assert.equal(sent.filter((m) => m.idempotencyKey === `order-confirmation:${order.id}`).length, 1, JSON.stringify(results));
    assert.equal((await confirmationOf(order.id))!.status, "SENT");
  });

  await test("lock vencido (proceso caído en SENDING) → se retoma y se envía", async () => {
    const { order } = await confirmedOrder("E8");
    await lib.confirmOrder(order.id);
    const id = (await confirmationOf(order.id))!.id;
    await db.emailOutbox.update({ where: { id }, data: { status: "SENDING", lockedUntil: new Date(Date.now() - 1000), attempts: 1 } });
    const { sent, sender } = fakeSender();
    assert.equal(await lib.emails.deliverEmail(id, sender), "sent");
    assert.equal(sent.length, 1);
  });

  await test("refund `requires_action` repetido (eventos duplicados) → UN solo aviso al admin (observación del auditor)", async () => {
    const order = await refundRaceOrder("E9");
    const ra = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "requires_action", order.id) } });
    const e = refundEvt("refund.updated", order.stripeRefundId!, order.id, "requires_action");
    for (let i = 0; i < 3; i++) assert.deepEqual(await lib.handleStripeEvent(e, ra), { action: "refund:REFUND_PENDING", orderId: order.id });
    assert.equal(await alertsFor(order.id), 1);
    assert.equal((await orderOf(order.id)).status, "OVERSELL_REFUND_PENDING");
  });

  await test("aviso de refund fallido: va a ADMIN_ALERT_EMAIL (por defecto alertas@hagpartner.com) con datos útiles", async () => {
    const order = await refundRaceOrder("E10");
    await lib.handleStripeEvent(refundEvt("refund.failed", order.stripeRefundId!, order.id, "failed"), refundFailedClient(order.id));
    const alert = await db.emailOutbox.findFirstOrThrow({ where: { orderId: order.id, kind: "ADMIN_ALERT" } });
    assert.equal(alert.to, "alertas@hagpartner.com");
    assert.match(alert.subject, /Refund failed/);
    assert.ok(alert.text.includes(order.id) && alert.text.includes(order.stripeRefundId!));
    assert.ok(alert.html.includes(`/admin/orders/${order.id}`));
  });

  await test("pago sin orden repetido → UN solo aviso (dedupe por PaymentIntent)", async () => {
    const orphan = evt("payment_intent.succeeded", { id: "pi_orphan_dedupe", object: "payment_intent", status: "succeeded", metadata: {} });
    await lib.handleStripeEvent(orphan);
    await lib.handleStripeEvent(orphan);
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: "admin:orphan-payment:pi_orphan_dedupe" } }), 1);
  });

  await test("webhook payment_intent.succeeded con pago real → orden confirmada y confirmación encolada", async () => {
    const { order } = await pendingWithPayment("E12");
    const pi = await pay(order.stripePaymentIntentId!);
    assert.equal((await postWebhook(evt("payment_intent.succeeded", pi))).status, 200);
    assert.equal((await orderOf(order.id)).status, "PAYMENT_CONFIRMED");
    const email = await confirmationOf(order.id);
    assert.ok(email);
    assert.equal(email!.status, "PENDING", "sin clave de Resend en pruebas queda pendiente para el reintento");
  });

  console.log("\nHAG-103 NO-GO v1 · Mayor 1 — persistir el aviso es obligatorio (fallo de escritura → 5xx y reintento)");

  // Middleware de prueba: la próxima escritura createMany en EmailOutbox falla (fallo transitorio de la base).
  let failNextOutboxWrite = false;
  db.$use(async (params, next) => {
    if (failNextOutboxWrite && params.model === "EmailOutbox" && params.action === "createMany") {
      failNextOutboxWrite = false;
      throw new Error("fallo transitorio simulado de PostgreSQL al escribir EmailOutbox");
    }
    return next(params);
  });

  await test("pago huérfano: falla el encolado → webhook 500 y sin fila; reenvío → 200 y UNA fila", async () => {
    const orphan = evt("payment_intent.succeeded", { id: "pi_orphan_fail_write", object: "payment_intent", status: "succeeded", metadata: {} });
    failNextOutboxWrite = true;
    assert.equal((await postWebhook(orphan)).status, 500);
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: "admin:orphan-payment:pi_orphan_fail_write" } }), 0);
    assert.equal((await postWebhook(orphan)).status, 200);
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: "admin:orphan-payment:pi_orphan_fail_write" } }), 1);
    assert.equal((await postWebhook(orphan)).status, 200, "con el aviso ya persistido (dedupe) sigue respondiendo 200");
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: "admin:orphan-payment:pi_orphan_fail_write" } }), 1);
  });

  await test("requires_action: falla el encolado → el evento falla (5xx), sin fila; reintento → UNA fila", async () => {
    const order = await refundRaceOrder("F2");
    const ra = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "requires_action", order.id) } });
    const e = refundEvt("refund.updated", order.stripeRefundId!, order.id, "requires_action");
    failNextOutboxWrite = true;
    await assert.rejects(lib.handleStripeEvent(e, ra));
    assert.equal(await alertsFor(order.id), 0);
    assert.deepEqual(await lib.handleStripeEvent(e, ra), { action: "refund:REFUND_PENDING", orderId: order.id });
    assert.equal(await alertsFor(order.id), 1);
  });

  console.log("\nHAG-103 NO-GO v1 · Observación — requires_action solo si sigue aplicando");

  await test("requires_action atrasado con la orden ya CANCELLED_REFUNDED → sin aviso", async () => {
    const order = await refundRaceOrder("F3");
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED_REFUNDED" } });
    const ra = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "requires_action", order.id) } });
    assert.deepEqual(await lib.handleStripeEvent(refundEvt("refund.updated", order.stripeRefundId!, order.id, "requires_action"), ra), { action: "refund:SKIPPED", orderId: order.id });
    assert.equal(await alertsFor(order.id), 0);
  });

  await test("requires_action de OTRO refund (la orden tiene uno distinto guardado) → sin aviso", async () => {
    const order = await refundRaceOrder("F4");
    const ra = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "requires_action", order.id) } });
    const r = await lib.handleStripeEvent(refundEvt("refund.updated", "re_otro_F4", order.id, "requires_action"), ra);
    assert.deepEqual(r, { action: "refund:SKIPPED", orderId: order.id });
    assert.equal(await alertsFor(order.id), 0);
    assert.equal((await orderOf(order.id)).stripeRefundId, order.stripeRefundId, "el refund guardado no cambia");
  });

  console.log("\nHAG-103 NO-GO v1 · Mayor 2 — un dueño viejo del lock no pisa el resultado del nuevo");

  // Proveedor cuya respuesta se pausa hasta abrir la compuerta y luego responde según `outcome`.
  const gatedSender = (outcome: "ok" | "error" | "not_configured", id = "msg_A") => {
    const g = gate();
    const sender = async () => {
      g.entered();
      await g.opened;
      if (outcome === "error") throw new Error("Resend: 503 tardío");
      if (outcome === "not_configured") throw new lib.emails.EmailNotConfiguredError("sin clave (tardío)");
      return { id };
    };
    return { g, sender };
  };
  const expireLock = (id: string) => db.emailOutbox.update({ where: { id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
  const queuedConfirmation = async (tag: string) => {
    const { order } = await confirmedOrder(tag);
    await lib.confirmOrder(order.id);
    return (await confirmationOf(order.id))!.id;
  };

  await test("A vence, B envía OK, A termina con ERROR → queda SENT con el id de B", async () => {
    const id = await queuedConfirmation("L1");
    const a = gatedSender("error");
    const aDone = lib.emails.deliverEmail(id, a.sender);
    await a.g.reached;
    await expireLock(id);
    assert.equal(await lib.emails.deliverEmail(id, fakeSender().sender), "sent");
    a.g.open();
    assert.equal(await aDone, "skipped");
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "SENT");
    assert.equal(row.providerMessageId, "msg_1");
  });

  await test("A vence, B reclama, A termina OK → A no libera ni pisa el reclamo de B; luego B → SENT", async () => {
    const id = await queuedConfirmation("L2");
    const a = gatedSender("ok", "msg_A");
    const aDone = lib.emails.deliverEmail(id, a.sender);
    await a.g.reached;
    await expireLock(id);
    const b = gatedSender("ok", "msg_B");
    const bDone = lib.emails.deliverEmail(id, b.sender);
    await b.g.reached;
    const bToken = (await db.emailOutbox.findUniqueOrThrow({ where: { id } })).claimToken;
    a.g.open();
    assert.equal(await aDone, "skipped");
    const mid = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
    assert.equal(mid.status, "SENDING");
    assert.equal(mid.claimToken, bToken, "el reclamo sigue siendo de B");
    b.g.open();
    assert.equal(await bDone, "sent");
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "SENT");
    assert.equal(row.providerMessageId, "msg_B");
  });

  await test("rama not_configured: A vence, B envía OK, A recibe 'sin clave' → sigue SENT y no se descuentan intentos", async () => {
    const id = await queuedConfirmation("L3");
    const a = gatedSender("not_configured");
    const aDone = lib.emails.deliverEmail(id, a.sender);
    await a.g.reached;
    await expireLock(id);
    assert.equal(await lib.emails.deliverEmail(id, fakeSender().sender), "sent");
    const attempts = (await db.emailOutbox.findUniqueOrThrow({ where: { id } })).attempts;
    a.g.open();
    assert.equal(await aDone, "skipped");
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "SENT");
    assert.equal(row.attempts, attempts);
  });

  await test("timeout del proveedor (EMAIL_SEND_TIMEOUT_MS) → retry con el error, sin quedar en SENDING", async () => {
    const id = await queuedConfirmation("L4");
    process.env.EMAIL_SEND_TIMEOUT_MS = "200";
    try {
      const never = async () => new Promise<{ id: string }>(() => {});
      assert.equal(await lib.emails.deliverEmail(id, never), "retry");
    } finally {
      delete process.env.EMAIL_SEND_TIMEOUT_MS;
    }
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "PENDING");
    assert.equal(row.claimToken, null);
    assert.match(row.lastError ?? "", /tiempo de envío agotado/);
  });

  console.log("\nHAG-103 NO-GO v1 · Observaciones — presupuesto de tiempo y reintento desde la confirmación");

  await test("deliverPending con budgetMs termina dentro del presupuesto (el envío en curso se recorta)", async () => {
    await db.emailOutbox.updateMany({ where: { status: "PENDING" }, data: { status: "FAILED" } }); // aislar el lote
    const ids = [] as string[];
    for (const t of ["B1", "B2", "B3", "B4"]) ids.push(await queuedConfirmation(t));
    const { sent, sender } = fakeSender({ delayMs: 300 });
    const started = Date.now();
    process.env.EMAIL_MIN_SEND_WINDOW_MS = "100";
    const counts = await lib.emails.deliverPending({ sender, budgetMs: 450 }).finally(() => delete process.env.EMAIL_MIN_SEND_WINDOW_MS);
    assert.ok(counts.sent >= 1 && counts.sent <= 2, JSON.stringify(counts));
    assert.equal(sent.length, counts.sent);
    assert.ok(Date.now() - started < 450 + 200, `tardó ${Date.now() - started} ms`);
    // Cada compra encola 2 emails (confirmación + aviso de venta, HAG-123): 8 en total.
    assert.equal(await db.emailOutbox.count({ where: { status: "PENDING" } }), 8 - counts.sent);
  });

  await test("visitar la confirmación de una orden ya pagada intenta enviar su email pendiente", async () => {
    const { order } = await confirmedOrder("V1");
    await lib.confirmOrder(order.id);
    const before = (await confirmationOf(order.id))!;
    assert.equal(before.lastError, null);
    const r = await lib.reconcileOrderPayment(order.id);
    assert.deepEqual(r, { status: "PAYMENT_CONFIRMED", paymentIntentStatus: null });
    const after = (await confirmationOf(order.id))!;
    assert.match(after.lastError ?? "", /RESEND_API_KEY no configurada/, "se intentó la entrega (sin clave en pruebas)");
    assert.equal(after.status, "PENDING");
  });

  console.log("\nHAG-123 — aviso al dueño por cada venta nueva");

  const newOrderOf = (orderId: string) => db.emailOutbox.findUnique({ where: { dedupeKey: `admin:new-order:${orderId}` } });

  await test("confirmOrder encola el aviso de venta nueva junto a la confirmación; con oversell (rollback) no queda ninguno", async () => {
    const { order } = await confirmedOrder("N1", `Taza <b>roja</b> & "Co"`);
    assert.equal(await lib.confirmOrder(order.id), "confirmed");
    const n = await newOrderOf(order.id);
    assert.ok(n);
    assert.equal(n!.kind, "ADMIN_NEW_ORDER");
    assert.equal(n!.to, "alertas@hagpartner.com", "sin ORDER_NOTIFY_EMAIL ni ADMIN_ALERT_EMAIL usa el destinatario por defecto");
    assert.equal(n!.subject, "[HAG Supply] New order T-N1 — $25.00");
    const buyer = (await db.user.findUniqueOrThrow({ where: { id: order.userId } })).email;
    for (const piece of ["New order: $25.00", "T-N1", "Ana María Pérez", buyer, "2 × $12.50", "1 Ocean Dr", "Miami, FL 33139", `/admin/orders/${order.id}`]) {
      assert.ok(n!.html.includes(piece), `HTML sin "${piece}"`);
    }
    assert.ok(!n!.html.includes("<b>roja</b>") && n!.html.includes("&lt;b&gt;roja&lt;/b&gt;"), "nombre escapado");
    assert.ok(n!.text.includes(`Customer: Ana María Pérez <${buyer}>`));
    const { product, order: o2 } = await confirmedOrder("N1B");
    await db.product.update({ where: { id: product.id }, data: { stock: 1 } });
    assert.equal(await lib.confirmOrder(o2.id), "oversell");
    assert.equal(await newOrderOf(o2.id), null);
  });

  await test("confirmaciones concurrentes → UN solo aviso de venta; ORDER_NOTIFY_EMAIL y ADMIN_ALERT_EMAIL eligen el destinatario", async () => {
    const { order } = await confirmedOrder("N2");
    process.env.ADMIN_ALERT_EMAIL = "admin@test.local";
    try {
      await Promise.all([lib.confirmOrder(order.id), lib.confirmOrder(order.id), lib.confirmOrder(order.id)]);
      assert.equal(await db.emailOutbox.count({ where: { orderId: order.id, kind: "ADMIN_NEW_ORDER" } }), 1);
      assert.equal((await newOrderOf(order.id))!.to, "admin@test.local");
      const { order: o3 } = await confirmedOrder("N3");
      process.env.ORDER_NOTIFY_EMAIL = "ventas@test.local";
      await lib.confirmOrder(o3.id);
      assert.equal((await newOrderOf(o3.id))!.to, "ventas@test.local");
    } finally {
      delete process.env.ADMIN_ALERT_EMAIL;
      delete process.env.ORDER_NOTIFY_EMAIL;
    }
  });

  await test("el envío de la orden entrega confirmación y aviso de venta (dos envíos, cada uno a su destinatario)", async () => {
    const { order } = await confirmedOrder("N4");
    await lib.confirmOrder(order.id);
    const { sent, sender } = fakeSender();
    await lib.emails.sendOrderConfirmation(order.id, sender);
    assert.equal(sent.length, 2);
    const buyer = (await db.user.findUniqueOrThrow({ where: { id: order.userId } })).email;
    assert.deepEqual(sent.map((m) => m.to).sort(), [buyer, "alertas@hagpartner.com"].sort());
    assert.equal(await db.emailOutbox.count({ where: { orderId: order.id, status: "SENT" } }), 2);
  });

  await test("webhook payment_intent.succeeded con pago real → también encola el aviso de venta", async () => {
    const { order } = await pendingWithPayment("N5");
    const pi = await pay(order.stripePaymentIntentId!);
    assert.equal((await postWebhook(evt("payment_intent.succeeded", pi))).status, 200);
    assert.ok(await newOrderOf(order.id));
  });

  await test("cron: sin CRON_SECRET → 503; secreto incorrecto → 401; correcto → 200 y entrega lo vencido", async () => {
    const call = (auth?: string) => lib.cronGET(new Request("http://localhost/api/cron/email-outbox", { headers: auth ? { authorization: auth } : {} }));
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    assert.equal((await call(`Bearer ${saved}`)).status, 503);
    process.env.CRON_SECRET = saved;
    assert.equal((await call("Bearer otro")).status, 401);
    const res = await call(`Bearer ${saved}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok("not_configured" in body && "sent" in body);
  });

  console.log("\nHAG-124 — pagos de otro origen (cuenta de Stripe de prueba compartida)");

  await test("startCheckout guarda metadata.origin con el host de esta instalación (sin confirmar el pago)", async () => {
    const user = await newUser();
    const p = await mk("OR1", 10, 5);
    await cart(user.id, [{ productId: p.id, quantity: 1 }]);
    const r = await lib.startCheckout(user.id, SHIPPING);
    if (r.kind !== "payment") throw new Error(JSON.stringify(r));
    const pi = await stripe.paymentIntents.retrieve((await orderOf(r.orderId)).stripePaymentIntentId!);
    assert.equal(pi.metadata.origin, new URL(process.env.NEXTAUTH_URL ?? "https://supply.hagpartner.com").host);
  });

  await test("pago sin orden de OTRO origen → ignorado (200) y SIN aviso al admin", async () => {
    const e = evt("payment_intent.succeeded", { id: "pi_foreign_origin", object: "payment_intent", status: "succeeded", metadata: { orderId: "x", origin: "otra-instalacion.example" } });
    assert.deepEqual(await postWebhook(e), { status: 200, body: { received: true } });
    assert.deepEqual(await lib.handleStripeEvent(e), { action: "ignored:foreign_origin" });
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: "admin:orphan-payment:pi_foreign_origin" } }), 0);
  });

  await test("pago sin orden del MISMO origen → sigue avisando al admin (un aviso)", async () => {
    const own = new URL(process.env.NEXTAUTH_URL ?? "https://supply.hagpartner.com").host;
    const e = evt("payment_intent.succeeded", { id: "pi_own_origin", object: "payment_intent", status: "succeeded", metadata: { orderId: "y", origin: own } });
    assert.equal((await lib.handleStripeEvent(e)).action, "orphan_payment");
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: "admin:orphan-payment:pi_own_origin" } }), 1);
  });

  console.log("\nHAG-125 — la excepción de origen solo aplica en modo test");

  await test("evento LIVE de pago sin orden con OTRO origen → avisa igual (no se silencia)", async () => {
    const e = { ...evt("payment_intent.succeeded", { id: "pi_live_foreign", object: "payment_intent", status: "succeeded", metadata: { orderId: "z", origin: "otra-instalacion.example" } }), livemode: true } as AnyEvent;
    assert.equal((await lib.handleStripeEvent(e)).action, "orphan_payment");
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: "admin:orphan-payment:pi_live_foreign" } }), 1);
  });

  console.log("\nHAG-121 — reencolado controlado de emails FAILED");

  const failedEmail = async (tag: string) => {
    const id = await queuedConfirmation(tag);
    await db.emailOutbox.update({ where: { id }, data: { status: "FAILED", attempts: 8, lastError: "Resend: 503 (simulado)" } });
    return id;
  };

  await test("requeueFailedEmail: FAILED → PENDING con intentos a cero y registra quién/cuándo; luego se envía", async () => {
    const id = await failedEmail("Q1");
    assert.equal(await lib.emails.requeueFailedEmail(id, "admin@test.local"), true);
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "PENDING");
    assert.equal(row.attempts, 0);
    assert.equal(row.requeuedBy, "admin@test.local");
    assert.ok(row.requeuedAt);
    assert.equal(row.requeueCount, 1);
    assert.equal(await lib.emails.deliverEmail(id, fakeSender().sender), "sent");
  });

  await test("requeue de un email que NO está FAILED (PENDING o SENT) → no hace nada", async () => {
    const pendingId = await queuedConfirmation("Q2");
    assert.equal(await lib.emails.requeueFailedEmail(pendingId, "admin@test.local"), false);
    assert.equal(await lib.emails.deliverEmail(pendingId, fakeSender().sender), "sent");
    assert.equal(await lib.emails.requeueFailedEmail(pendingId, "admin@test.local"), false);
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { id: pendingId } });
    assert.equal(row.status, "SENT");
    assert.equal(row.requeueCount, 0);
  });

  await test("dos admins reintentan el mismo FAILED a la vez → un solo reencolado", async () => {
    const id = await failedEmail("Q3");
    const results = await Promise.all([lib.emails.requeueFailedEmail(id, "a@test.local"), lib.emails.requeueFailedEmail(id, "b@test.local")]);
    assert.deepEqual([...results].sort(), [false, true]);
    assert.equal((await db.emailOutbox.findUniqueOrThrow({ where: { id } })).requeueCount, 1);
  });

  await test("getOutboxHealth cuenta FAILED y atrasados (PENDING vencido > 30 min o SENDING con lock vencido)", async () => {
    await db.emailOutbox.updateMany({ where: { status: { in: ["PENDING", "SENDING", "FAILED"] } }, data: { status: "SENT" } }); // aislar
    await failedEmail("Q4");
    const late = await queuedConfirmation("Q5");
    await db.emailOutbox.update({ where: { id: late }, data: { nextAttemptAt: new Date(Date.now() - 45 * 60 * 1000) } });
    const stale = await queuedConfirmation("Q6");
    await db.emailOutbox.update({ where: { id: stale }, data: { status: "SENDING", lockedUntil: new Date(Date.now() - 1000) } });
    await queuedConfirmation("Q7"); // pendiente reciente: no cuenta como atrasado
    const h = await lib.emails.getOutboxHealth();
    assert.equal(h.failed, 1);
    assert.equal(h.overdue, 2);
    assert.ok(h.oldestOverdueAt);
  });

  console.log("\nHAG-122 — cron con presupuesto y monitoreo");

  await test("cron con emails fallidos → responde salud y avisa UNA vez por día (dedupe)", async () => {
    const saved = process.env.CRON_SECRET;
    const call = () => lib.cronGET(new Request("http://localhost/api/cron/email-outbox", { headers: { authorization: `Bearer ${saved}` } }));
    const r1 = await call();
    assert.equal(r1.status, 200);
    const body = await r1.json();
    assert.ok(body.health && typeof body.health.failed === "number");
    assert.ok(body.health.failed >= 1, "hay al menos el FAILED de la prueba anterior");
    await call();
    const day = new Date().toISOString().slice(0, 10);
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: `admin:outbox-health:${day}` } }), 1);
  });

  console.log("\nHAG-122 NO-GO v1 — deadline compartido por toda la petición");

  // Las rutas usan el proveedor real (Resend SDK → fetch). Se intercepta solo api.resend.com con una latencia o
  // un error programados, en tiempo REAL: el timeout de cada envío y el deadline se ejercitan de verdad. Las
  // ventanas se achican por env (solo pueden achicarse) para no esperar 45 s.
  const realFetch = globalThis.fetch;
  let resendCalls = 0;
  const withResend = async (opts: { delayMs?: number; delays?: number[]; status?: number }, fn: () => Promise<void>) => {
    resendCalls = 0;
    process.env.RESEND_API_KEY = "re_test_offline_only";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("api.resend.com")) return realFetch(input, init);
      const n = ++resendCalls;
      await new Promise((r) => setTimeout(r, opts.delays?.[n - 1] ?? opts.delayMs ?? 0));
      return opts.status && opts.status >= 400
        ? Response.json({ name: "internal_server_error", message: "simulado" }, { status: opts.status })
        : Response.json({ id: `re_offline_${n}` });
    }) as typeof fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.RESEND_API_KEY;
    }
  };
  const withEnv = async (vars: Record<string, string>, fn: () => Promise<void>) => {
    const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    Object.assign(process.env, vars);
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
  const isolateOutbox = () =>
    db.emailOutbox.updateMany({ where: { status: { in: ["PENDING", "SENDING"] } }, data: { status: "SENT" } });
  const backlog = async (tag: string, n: number) => {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const row = await db.emailOutbox.create({
        data: { dedupeKey: `test-backlog:${tag}:${i}`, kind: "ADMIN_ALERT", to: "owner@test.local", subject: `Backlog ${tag} ${i}`, html: "x", text: "x" },
      });
      ids.push(row.id);
    }
    return ids;
  };
  const cronCall = () =>
    lib.cronGET(new Request("http://localhost/api/cron/email-outbox", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  const timed = async <T,>(fn: () => Promise<T>) => {
    const t0 = Date.now();
    const value = await fn();
    return { value, ms: Date.now() - t0 };
  };
  // Escala de prueba: ventana 3 s, envío máx. 1,5 s, ventana mínima 0,3 s. Holgura para base y respuesta: 1 s.
  const SCALE = { EMAIL_REQUEST_WINDOW_MS: "3000", EMAIL_SEND_TIMEOUT_MS: "1500", EMAIL_MIN_SEND_WINDOW_MS: "300" };
  const SLACK_MS = 1000;

  await test("ventanas de las rutas: caben en su maxDuration con reserva ≥ 10 s; el override de pruebas solo achica", async () => {
    const cronMax = (await import("@/app/api/cron/email-outbox/route")).maxDuration * 1000;
    const hookMax = (await import("@/app/api/webhooks/stripe/route")).maxDuration * 1000;
    assert.ok(cronMax - lib.emails.CRON_EMAIL_WINDOW_MS >= 10_000, "reserva del cron");
    assert.ok(hookMax - lib.emails.WEBHOOK_EMAIL_WINDOW_MS >= 10_000, "reserva del webhook");
    await withEnv({ EMAIL_REQUEST_WINDOW_MS: "999999" }, async () => {
      assert.equal(lib.emails.requestEmailDeadline(0, lib.emails.CRON_EMAIL_WINDOW_MS), lib.emails.CRON_EMAIL_WINDOW_MS);
    });
  });

  await test("cron completo: backlog + proveedor lento + aviso diario nuevo → responde dentro del deadline, conserva pendientes y luego se recuperan", async () => {
    await isolateOutbox();
    const day = new Date().toISOString().slice(0, 10);
    await db.emailOutbox.deleteMany({ where: { dedupeKey: `admin:outbox-health:${day}` } });
    await failedEmail("DLN1"); // dispara el aviso diario
    const ids = await backlog("cron", 6);
    await withEnv(SCALE, () =>
      withResend({ delayMs: 1300 }, async () => {
        const { value: res, ms } = await timed(cronCall);
        assert.equal(res.status, 200);
        assert.ok(ms < 3000 + SLACK_MS, `cron tardó ${ms} ms`);
        assert.ok(resendCalls >= 1 && resendCalls <= 3, `envíos iniciados: ${resendCalls}`);
      })
    );
    const rows = await db.emailOutbox.findMany({ where: { id: { in: ids } } });
    assert.equal(rows.filter((r) => r.status === "SENDING").length, 0, "nada queda reclamado");
    const untouched = rows.filter((r) => r.status === "PENDING" && r.attempts === 0);
    assert.ok(untouched.length >= 3, "los no iniciados siguen PENDING sin gastar intentos");
    const alert = await db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey: `admin:outbox-health:${day}` } });
    assert.ok(alert.status === "PENDING" || alert.status === "SENT", "el aviso diario quedó persistido");

    // Recuperación: siguiente ejecución con el proveedor sano → sale todo lo pendiente, aviso incluido.
    await withEnv(SCALE, () =>
      withResend({ delayMs: 20 }, async () => {
        for (let i = 0; i < 3; i++) assert.equal((await cronCall()).status, 200);
      })
    );
    const pendingDue = await db.emailOutbox.count({
      where: { id: { in: [...ids, alert.id] }, status: { not: "SENT" }, nextAttemptAt: { lte: new Date() } },
    });
    assert.equal(pendingDue, 0, "todo lo vencido se envió");
    assert.equal((await db.emailOutbox.findUniqueOrThrow({ where: { id: alert.id } })).status, "SENT");
  });

  await test("cron completo con proveedor colgado: el envío se corta en el deadline (no en su timeout propio)", async () => {
    await isolateOutbox();
    await backlog("hang", 3);
    await withEnv({ ...SCALE, EMAIL_SEND_TIMEOUT_MS: "60000" }, () =>
      withResend({ delayMs: 8_000 }, async () => {
        const { value: res, ms } = await timed(cronCall);
        assert.equal(res.status, 200);
        assert.ok(ms < 3000 + SLACK_MS, `cron tardó ${ms} ms`);
        assert.equal(resendCalls, 1, "un solo envío iniciado, cortado al deadline");
      })
    );
    assert.equal(await db.emailOutbox.count({ where: { status: "SENDING" } }), 0);
  });

  await test("cron completo con fallos del proveedor (500) → reintentos con backoff, responde dentro del deadline", async () => {
    await isolateOutbox();
    const ids = await backlog("err", 4);
    await withEnv(SCALE, () =>
      withResend({ status: 500, delayMs: 50 }, async () => {
        const { value: res, ms } = await timed(cronCall);
        assert.equal(res.status, 200);
        assert.ok(ms < 3000 + SLACK_MS, `cron tardó ${ms} ms`);
      })
    );
    const rows = await db.emailOutbox.findMany({ where: { id: { in: ids } } });
    assert.ok(rows.every((r) => r.status === "PENDING" && r.attempts === 1 && r.nextAttemptAt > new Date()), JSON.stringify(rows.map((r) => [r.status, r.attempts])));
    assert.ok(rows.every((r) => /Resend/.test(r.lastError ?? "")));
  });

  await test("webhook completo: aviso de huérfano + barrido comparten el deadline; pendientes conservados y recuperados", async () => {
    await isolateOutbox();
    const ids = await backlog("hook", 4);
    const pi = `pi_test_deadline_${Date.now()}`;
    const event = {
      id: `evt_test_deadline_${Date.now()}`, object: "event", type: "payment_intent.succeeded", livemode: true,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: pi, object: "payment_intent", status: "succeeded", amount: 1000, metadata: { origin: "otro.example" } } },
    } as unknown as AnyEvent;
    await withEnv(SCALE, () =>
      withResend({ delayMs: 1300 }, async () => {
        const { value: r, ms } = await timed(() => postWebhook(event));
        assert.equal(r.status, 200);
        assert.ok(ms < 3000 + SLACK_MS, `webhook tardó ${ms} ms`);
        assert.ok(resendCalls >= 1 && resendCalls <= 3, `envíos iniciados: ${resendCalls}`);
      })
    );
    const alert = await db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey: `admin:orphan-payment:${pi}` } });
    const all = await db.emailOutbox.findMany({ where: { id: { in: [...ids, alert.id] } } });
    assert.equal(all.filter((r) => r.status === "SENDING").length, 0);
    assert.ok(all.filter((r) => r.status === "PENDING" && r.attempts === 0).length >= 2, "pendientes no iniciados intactos");

    await withEnv(SCALE, () =>
      withResend({ delayMs: 20 }, async () => {
        for (let i = 0; i < 3; i++) assert.equal((await cronCall()).status, 200);
      })
    );
    const left = await db.emailOutbox.count({ where: { id: { in: [...ids, alert.id] }, status: { not: "SENT" }, nextAttemptAt: { lte: new Date() } } });
    assert.equal(left, 0);
    assert.equal((await db.emailOutbox.findUniqueOrThrow({ where: { id: alert.id } })).status, "SENT");
  });

  // Los dos escenarios del veredicto (68,8 s y 37,7 s), a escala 1/10 y en tiempo real: mismas duraciones
  // relativas, ventanas 4,5 s (cron) y 2 s (webhook), timeout de envío 1,5 s.
  await test("escenario del auditor, cron (13/13/13/14,9 s + aviso diario) a escala 1/10 → termina dentro de su ventana", async () => {
    await isolateOutbox();
    const day = new Date().toISOString().slice(0, 10);
    await db.emailOutbox.deleteMany({ where: { dedupeKey: `admin:outbox-health:${day}` } });
    await backlog("aud-cron", 6);
    await withEnv({ ...SCALE, EMAIL_REQUEST_WINDOW_MS: "4500" }, () =>
      withResend({ delays: [1300, 1300, 1300, 1490, 1490] }, async () => {
        const { value: res, ms } = await timed(cronCall);
        assert.equal(res.status, 200);
        assert.ok(ms < 4500 + SLACK_MS, `cron tardó ${ms} ms (antes: 6880 a esta escala)`);
        console.log(`    cron: ${ms} ms con ventana 4500 (antes del arreglo: 6880), envíos iniciados ${resendCalls}`);
      })
    );
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: `admin:outbox-health:${day}` } }), 1, "aviso persistido");
    assert.equal(await db.emailOutbox.count({ where: { status: "SENDING" } }), 0);
  });

  await test("escenario del auditor, webhook (huérfano 7,9/14,9 s + barrido 14,9 s) a escala 1/10 → termina dentro de su ventana", async () => {
    await isolateOutbox();
    await backlog("aud-hook", 3);
    const pi = `pi_test_aud_${Date.now()}`;
    const event = {
      id: `evt_test_aud_${Date.now()}`, object: "event", type: "payment_intent.succeeded", livemode: true,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: pi, object: "payment_intent", status: "succeeded", amount: 1000, metadata: { origin: "otro.example" } } },
    } as unknown as AnyEvent;
    await withEnv({ ...SCALE, EMAIL_REQUEST_WINDOW_MS: "2000" }, () =>
      withResend({ delays: [790, 1490, 1490] }, async () => {
        const { value: r, ms } = await timed(() => postWebhook(event));
        assert.equal(r.status, 200);
        assert.ok(ms < 2000 + SLACK_MS, `webhook tardó ${ms} ms (antes: 3770 a esta escala)`);
        console.log(`    webhook: ${ms} ms con ventana 2000 (antes del arreglo: 3770), envíos iniciados ${resendCalls}`);
      })
    );
    assert.ok(await db.emailOutbox.findUnique({ where: { dedupeKey: `admin:orphan-payment:${pi}` } }), "aviso persistido");
    assert.equal(await db.emailOutbox.count({ where: { status: "SENDING" } }), 0);
  });

  await test("latencia de la base tras el reclamo: si ya no cabe el envío, se libera sin gastar intento ni llamar al proveedor", async () => {
    await isolateOutbox();
    const [id] = await backlog("slowdb", 1);
    const original = db.emailOutbox.findUniqueOrThrow;
    Object.assign(db.emailOutbox, {
      findUniqueOrThrow: async (...args: Parameters<typeof original>) => {
        await new Promise((r) => setTimeout(r, 500));
        return original.apply(db.emailOutbox, args);
      },
    });
    const { sent, sender } = fakeSender();
    try {
      await withEnv({ EMAIL_MIN_SEND_WINDOW_MS: "300" }, async () => {
        assert.equal(await lib.emails.deliverEmail(id, sender, Date.now() + 600), "deferred");
      });
    } finally {
      Object.assign(db.emailOutbox, { findUniqueOrThrow: original });
    }
    assert.equal(sent.length, 0);
    const row = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
    assert.equal(row.status, "PENDING");
    assert.equal(row.attempts, 0);
    assert.equal(row.claimToken, null);
    assert.equal(await lib.emails.deliverEmail(id, sender), "sent", "sin deadline se envía normalmente");
  });

  await test("deadline anidado: un lote con presupuesto mayor no pasa el deadline de la petición", async () => {
    await isolateOutbox();
    await backlog("nested", 5);
    const { sender } = fakeSender({ delayMs: 400 });
    await withEnv({ EMAIL_MIN_SEND_WINDOW_MS: "100" }, async () => {
      const { value: counts, ms } = await timed(() =>
        lib.emails.withEmailDeadline(Date.now() + 1000, () => lib.emails.deliverPending({ sender, budgetMs: 60_000, limit: 10 }))
      );
      assert.ok(ms < 1000 + 300, `tardó ${ms} ms`);
      assert.ok(counts.sent >= 1 && counts.sent <= 3, JSON.stringify(counts));
    });
  });

  console.log("\nCancelar y reembolsar desde el admin");

  const ADMIN = { email: "admin@test.local", reason: "Cliente pidió cancelar" };
  // Pedido pagado con un PaymentIntent ficticio: el stock ya está descontado (5 → 3) como lo dejaría confirmOrder.
  const paidFakeOrder = async (tag: string, status: "PAYMENT_CONFIRMED" | "PROCESSING" | "SHIPPED" = "PAYMENT_CONFIRMED") => {
    const user = await newUser();
    const p = await mk(tag, 10, 3);
    const order = await db.order.create({
      data: {
        orderNumber: `T-${tag}`, userId: user.id, buyerEmail: user.email, buyerName: user.name, subtotal: 20, total: 20, status,
        stripePaymentIntentId: `pi_fake_${tag}`,
        items: { create: [{ productId: p.id, productName: p.name, quantity: 2, unitPrice: 10, total: 20 }] },
      },
    });
    return { order, product: p };
  };
  const emailsOf = (orderId: string, kind: "ORDER_CANCELLED" | "ORDER_REFUNDED" | "ORDER_CONFIRMATION") =>
    db.emailOutbox.findMany({ where: { orderId, kind } });
  // Cliente falso que respeta la idempotencia como Stripe: misma idempotencyKey → mismo refund (no se crea otro).
  type RefundCounter = { calls: number; byKey: Map<string, string>; keys: string[] };
  const newCounter = (): RefundCounter => ({ calls: 0, byKey: new Map(), keys: [] });
  const refundClient = (orderId: string, status: string, counter: RefundCounter = newCounter()) =>
    wrap({
      refunds: {
        list: async () => ({ data: [] }),
        create: async (params: { metadata?: Record<string, string> }, options?: { idempotencyKey?: string }) => {
          counter.calls++;
          assert.equal(params.metadata?.orderId, orderId, "el refund lleva metadata.orderId");
          const key = options?.idempotencyKey ?? `sin-clave-${counter.calls}`;
          counter.keys.push(key);
          if (!counter.byKey.has(key)) counter.byKey.set(key, `re_${orderId}_${counter.byKey.size + 1}`);
          return refundObj(counter.byKey.get(key)!, status, orderId);
        },
        retrieve: async (id: string) => refundObj(id, status, orderId),
      },
    });

  await test("cancelar pagado → refund con metadata.orderId, CANCELLED_REFUNDED, stock devuelto, quién/motivo; email de cancelación SIN afirmar emisión + email 'Refund issued' tras succeeded", async () => {
    const { order, product } = await paidFakeOrder("CX1");
    const counter = newCounter();
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded", counter)), "CANCELLED_REFUNDED");
    const o = await orderOf(order.id);
    assert.equal(o.status, "CANCELLED_REFUNDED");
    assert.equal(o.stripeRefundId, `re_${order.id}_1`);
    assert.equal(o.cancelledBy, "admin@test.local");
    assert.equal(o.cancelReason, "Cliente pidió cancelar");
    assert.ok(o.cancelledAt);
    assert.equal(await stockOf(product.id), 5, "stock devuelto");
    assert.deepEqual(counter.keys, [`refund-${order.id}`]);
    const cancelled = await emailsOf(order.id, "ORDER_CANCELLED");
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0].to, order.buyerEmail);
    assert.match(cancelled[0].subject, /Order cancelled — T-CX1/);
    assert.match(cancelled[0].text, /processing a full refund of \$20\.00/);
    assert.doesNotMatch(cancelled[0].text + cancelled[0].html, /issued a full refund|We've issued/i, "no afirma un refund emitido");
    const refunded = await emailsOf(order.id, "ORDER_REFUNDED");
    assert.equal(refunded.length, 1);
    assert.match(refunded[0].subject, /Refund issued — T-CX1/);
    assert.match(refunded[0].text, /issued a full refund of \$20\.00/);
  });

  await test("PROCESSING también se puede cancelar", async () => {
    const { order } = await paidFakeOrder("CX2", "PROCESSING");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
  });

  await test("SHIPPED (o pendiente de pago) → NOT_CANCELLABLE: sin refund, sin stock, sin email", async () => {
    const { order, product } = await paidFakeOrder("CX3", "SHIPPED");
    const counter = newCounter();
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded", counter)), "NOT_CANCELLABLE");
    assert.equal((await orderOf(order.id)).status, "SHIPPED");
    assert.equal(await stockOf(product.id), 3);
    assert.equal(counter.calls, 0);
    assert.equal((await emailsOf(order.id, "ORDER_CANCELLED")).length, 0);
    const pend = await oversellOrder("CX3B"); // PENDING_PAYMENT
    assert.equal(await lib.cancelAndRefund(pend.id, ADMIN, refundClient(pend.id, "succeeded")), "NOT_CANCELLABLE");
  });

  await test("dos cancelaciones simultáneas → stock devuelto UNA vez, un email, UN refund (misma idempotencyKey)", async () => {
    const { order, product } = await paidFakeOrder("CX4");
    const counter = newCounter();
    const client = refundClient(order.id, "succeeded", counter);
    const results = await Promise.all([lib.cancelAndRefund(order.id, ADMIN, client), lib.cancelAndRefund(order.id, ADMIN, client)]);
    assert.ok(results.every((r) => r === "CANCELLED_REFUNDED" || r === "ALREADY_DONE"), JSON.stringify(results));
    assert.equal(counter.byKey.size, 1, "un solo refund distinto");
    assert.ok(counter.keys.every((k) => k === `refund-${order.id}`), JSON.stringify(counter.keys));
    assert.equal(await stockOf(product.id), 5);
    assert.equal((await emailsOf(order.id, "ORDER_CANCELLED")).length, 1);
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 1);
    assert.equal((await orderOf(order.id)).status, "CANCELLED_REFUNDED");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, client), "ALREADY_DONE");
  });

  await test("error transitorio de Stripe → CANCEL_REFUND_PENDING sin email de 'Refund issued'; reintentar completa sin duplicar", async () => {
    const { order, product } = await paidFakeOrder("CX5");
    const flaky = wrap({ refunds: { list: async () => ({ data: [] }), create: async () => { throw new Error("ECONNRESET simulado"); } } });
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, flaky), "REFUND_ERROR");
    assert.equal((await orderOf(order.id)).status, "CANCEL_REFUND_PENDING");
    assert.equal(await stockOf(product.id), 5);
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 0, "no se anuncia un refund que no existe");
    const cancelled = await emailsOf(order.id, "ORDER_CANCELLED");
    assert.equal(cancelled.length, 1);
    assert.doesNotMatch(cancelled[0].text, /issued a full refund/);
    assert.equal(await lib.cancelAndRefund(order.id, { email: "otro@test.local" }, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
    const o = await orderOf(order.id);
    assert.equal(o.status, "CANCELLED_REFUNDED");
    assert.equal(o.cancelledBy, "admin@test.local", "el reintento no reescribe quién canceló");
    assert.equal(await stockOf(product.id), 5, "el reintento no devuelve stock otra vez");
    assert.equal((await emailsOf(order.id, "ORDER_CANCELLED")).length, 1);
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 1);
  });

  await test("refund `pending` → CANCEL_REFUND_PENDING sin 'Refund issued'; el webhook refund.updated (succeeded) lo concluye y recién ahí avisa", async () => {
    const { order } = await paidFakeOrder("CX6");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "pending")), "REFUND_PENDING");
    assert.equal((await orderOf(order.id)).status, "CANCEL_REFUND_PENDING");
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 0);
    const refundId = (await orderOf(order.id)).stripeRefundId!;
    const later = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "succeeded", order.id) } });
    const out = await lib.handleStripeEvent(evt("refund.updated", refundObj(refundId, "succeeded", order.id)), later);
    assert.deepEqual(out, { action: "refund:CANCELLED_REFUNDED", orderId: order.id });
    assert.equal((await orderOf(order.id)).status, "CANCELLED_REFUNDED");
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 1);
    // Evento duplicado: no repite el aviso.
    await lib.handleStripeEvent(evt("refund.updated", refundObj(refundId, "succeeded", order.id)), later);
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 1);
  });

  await test("refund `failed` → CANCEL_REFUND_FAILED con aviso de cancelación (no el de oversell) y sin 'Refund issued'", async () => {
    const { order } = await paidFakeOrder("CX7");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "failed")), "CANCEL_REFUND_FAILED");
    assert.equal((await orderOf(order.id)).status, "CANCEL_REFUND_FAILED");
    const alert = await db.emailOutbox.findUnique({ where: { dedupeKey: `admin:cancel-refund-failed:${order.id}:re_${order.id}_1` } });
    assert.ok(alert, "aviso de cancelación encolado");
    assert.match(alert!.subject, /Cancellation refund failed/);
    assert.equal(await db.emailOutbox.count({ where: { dedupeKey: { startsWith: `admin:refund-failed:${order.id}` } } }), 0);
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 0);
  });

  await test("refund completado que luego falla (webhook) → CANCELLED_REFUNDED pasa a CANCEL_REFUND_FAILED", async () => {
    const { order } = await paidFakeOrder("CX8");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
    const refundId = (await orderOf(order.id)).stripeRefundId!;
    const failed = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "failed", order.id) } });
    const out = await lib.handleStripeEvent(evt("refund.failed", refundObj(refundId, "failed", order.id)), failed);
    assert.deepEqual(out, { action: "refund:CANCEL_REFUND_FAILED", orderId: order.id });
    assert.equal((await orderOf(order.id)).status, "CANCEL_REFUND_FAILED");
  });

  await test("oversell sigue igual: refund failed → OVERSELL_REFUND_FAILED con su aviso propio; succeeded no manda 'Refund issued'", async () => {
    const order = await oversellOrder("CX9");
    const client = wrap({ refunds: { list: async () => ({ data: [] }), create: async () => refundObj("re_CX9", "failed", order.id) } });
    assert.equal(await lib.handleOversell(order.id, client), "OVERSELL_REFUND_FAILED");
    assert.ok(await db.emailOutbox.findUnique({ where: { dedupeKey: `admin:refund-failed:${order.id}:re_CX9` } }));
    const ok = await oversellOrder("CX9B");
    const okClient = wrap({ refunds: { list: async () => ({ data: [] }), create: async () => refundObj("re_CX9B", "succeeded", ok.id) } });
    assert.equal(await lib.handleOversell(ok.id, okClient), "CANCELLED_REFUNDED");
    assert.equal((await emailsOf(ok.id, "ORDER_REFUNDED")).length, 0);
  });

  console.log("\nCancelar y reembolsar NO-GO v1 · P1 — cancelación contra cambio de estado manual");

  await test("lectura desactualizada: PATCH leyó PROCESSING, la cancelación gana → el cambio a SHIPPED se rechaza (409) y el pedido sigue reembolsado", async () => {
    const { order } = await paidFakeOrder("RCX1", "PROCESSING");
    const staleFrom = (await orderOf(order.id)).status; // lo que leyó el PATCH
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
    const r = await lib.orderStatus.applyStatusTransition(order.id, staleFrom, "SHIPPED");
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, 409);
    assert.equal((await orderOf(order.id)).status, "CANCELLED_REFUNDED");
  });

  await test("lectura desactualizada PAYMENT_CONFIRMED → PROCESSING con la cancelación aún pendiente → 409; el refund puede concluir", async () => {
    const { order } = await paidFakeOrder("RCX2");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "pending")), "REFUND_PENDING");
    const r = await lib.orderStatus.applyStatusTransition(order.id, "PAYMENT_CONFIRMED", "PROCESSING");
    assert.equal(!r.ok && r.code, 409);
    assert.equal((await orderOf(order.id)).status, "CANCEL_REFUND_PENDING");
    const refundId = (await orderOf(order.id)).stripeRefundId!;
    const later = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "succeeded", order.id) } });
    await lib.handleStripeEvent(evt("refund.updated", refundObj(refundId, "succeeded", order.id)), later);
    assert.equal((await orderOf(order.id)).status, "CANCELLED_REFUNDED");
  });

  await test("el despacho gana primero → la cancelación es NOT_CANCELLABLE: sin refund, sin stock, sin email", async () => {
    const { order, product } = await paidFakeOrder("RCX3", "PROCESSING");
    const shipped = await lib.orderStatus.changeOrderStatus(order.id, "SHIPPED");
    assert.equal(shipped.ok, true);
    const counter = newCounter();
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded", counter)), "NOT_CANCELLABLE");
    assert.equal((await orderOf(order.id)).status, "SHIPPED");
    assert.equal(await stockOf(product.id), 3);
    assert.equal(counter.calls, 0);
    assert.equal((await emailsOf(order.id, "ORDER_CANCELLED")).length, 0);
  });

  await test("carrera real (10 rondas): despachar y cancelar a la vez → siempre gana uno y el otro no tiene efecto", async () => {
    for (let i = 0; i < 10; i++) {
      const { order, product } = await paidFakeOrder(`RCX4${i}`, "PROCESSING");
      const counter = newCounter();
      const [ship, cancel] = await Promise.all([
        lib.orderStatus.changeOrderStatus(order.id, "SHIPPED"),
        lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded", counter)),
      ]);
      const o = await orderOf(order.id);
      if (o.status === "SHIPPED") {
        assert.equal(ship.ok, true);
        assert.equal(cancel, "NOT_CANCELLABLE");
        assert.equal(o.cancelledAt, null);
        assert.equal(await stockOf(product.id), 3);
        assert.equal(counter.calls, 0);
      } else {
        assert.equal(o.status, "CANCELLED_REFUNDED", `ronda ${i}: ${o.status}`);
        assert.equal(ship.ok, false);
        assert.equal(await stockOf(product.id), 5);
      }
    }
  });

  console.log("\nCancelar y reembolsar NO-GO v1 · P2 — confirmación pendiente tras cancelar");

  await test("confirmación con backoff → cancelación → al vencer el backoff NO se envía (queda CANCELLED)", async () => {
    const { order } = await paidFakeOrder("PC1");
    await db.emailOutbox.create({
      data: {
        dedupeKey: `order-confirmation:${order.id}`, kind: "ORDER_CONFIRMATION", orderId: order.id, to: order.buyerEmail,
        subject: "Order confirmed", html: "x", text: "x", attempts: 1, lastError: "Resend: 503", nextAttemptAt: new Date(Date.now() + 60_000),
      },
    });
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
    // "Vence" el backoff: aun si la fila volviera a estar vencida, no es elegible.
    await db.emailOutbox.updateMany({ where: { orderId: order.id, kind: "ORDER_CONFIRMATION" }, data: { nextAttemptAt: new Date(0) } });
    const { sent, sender } = fakeSender();
    await lib.emails.deliverPending({ orderId: order.id, sender });
    const conf = (await emailsOf(order.id, "ORDER_CONFIRMATION"))[0];
    assert.equal(conf.status, "CANCELLED");
    assert.ok(!sent.some((e) => e.subject === "Order confirmed"), "la confirmación no se envió");
    assert.ok(sent.some((e) => /Order cancelled/.test(e.subject)), "la cancelación sí");
  });

  await test("confirmación en vuelo (SENDING) al cancelar: no se toca; si ese envío se cae y se retoma, se anula sin llamar al proveedor", async () => {
    const { order } = await paidFakeOrder("PC2");
    const row = await db.emailOutbox.create({
      data: {
        dedupeKey: `order-confirmation:${order.id}`, kind: "ORDER_CONFIRMATION", orderId: order.id, to: order.buyerEmail,
        subject: "Order confirmed", html: "x", text: "x", status: "SENDING", attempts: 1, claimToken: "otro", lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
    assert.equal((await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })).status, "SENDING", "un envío en vuelo no se pisa");
    // El proceso que la enviaba murió: el lock vence y otra ejecución la retoma.
    await db.emailOutbox.update({ where: { id: row.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    const { sent, sender } = fakeSender();
    assert.equal(await lib.emails.deliverEmail(row.id, sender), "cancelled");
    assert.equal(sent.length, 0);
    const after = await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.status, "CANCELLED");
    assert.equal(after.attempts, 1, "no gasta intento");
  });

  console.log("\nCancelar y reembolsar NO-GO v1 · cierre de un reembolso fallido hecho a mano en Stripe");

  const failedCancel = async (tag: string) => {
    const { order } = await paidFakeOrder(tag);
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "failed")), "CANCEL_REFUND_FAILED");
    return order;
  };
  const manualClient = (refund: Record<string, unknown>) => wrap({ refunds: { retrieve: async () => refund } });

  await test("registrar refund manual: se verifica en Stripe (pago, estado, monto) y recién entonces CANCELLED_REFUNDED + 'Refund issued'", async () => {
    const order = await failedCancel("MR1");
    const base = { id: "re_manual1", object: "refund", payment_intent: order.stripePaymentIntentId, status: "succeeded", amount: 2000, metadata: {} };
    const bad = [
      [{ ...base, payment_intent: "pi_otro" }, /different payment/],
      [{ ...base, status: "pending" }, /pending, not succeeded/],
      [{ ...base, amount: 1500 }, /less than the order total/],
    ] as const;
    for (const [refund, msg] of bad) {
      const r = await lib.markRefundedManually(order.id, "re_manual1", { email: "admin@test.local" }, manualClient(refund));
      assert.equal(r.ok, false);
      assert.match(!r.ok ? r.error : "", msg);
      assert.equal((await orderOf(order.id)).status, "CANCEL_REFUND_FAILED");
    }
    assert.equal((await lib.markRefundedManually(order.id, "no-es-un-id", { email: "admin@test.local" }, manualClient(base))).ok, false);
    const ok = await lib.markRefundedManually(order.id, "re_manual1", { email: "admin@test.local" }, manualClient(base));
    assert.equal(ok.ok, true);
    const o = await orderOf(order.id);
    assert.equal(o.status, "CANCELLED_REFUNDED");
    assert.equal(o.stripeRefundId, "re_manual1");
    assert.match(o.notes ?? "", /Refund completed manually in Stripe \(re_manual1\) — recorded by admin@test\.local/);
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 1);
    const again = await lib.markRefundedManually(order.id, "re_manual1", { email: "admin@test.local" }, manualClient(base));
    assert.equal(!again.ok && again.code, 409);
  });

  console.log("\nCancelar y reembolsar NO-GO v2 · aviso 'Refund issued' ligado al refund concreto");

  const refundedRow = (orderId: string, refundId: string) =>
    db.emailOutbox.findUnique({ where: { dedupeKey: `order-refunded:${orderId}:${refundId}` } });
  const failA = async (orderId: string, refundId: string) => {
    const failed = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "failed", orderId) } });
    const out = await lib.handleStripeEvent(evt("refund.failed", refundObj(refundId, "failed", orderId)), failed);
    assert.deepEqual(out, { action: "refund:CANCEL_REFUND_FAILED", orderId });
  };
  const manualB = (orderId: string, pi: string, id = "re_manualB") =>
    manualClient({ id, object: "refund", payment_intent: pi, status: "succeeded", amount: 2000, metadata: {} });

  await test("A succeeded con aviso pendiente → A falla → su aviso se anula y NO sale; B manual → aviso nuevo de B; repetir no duplica", async () => {
    const { order } = await paidFakeOrder("NA1");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
    const refundA = (await orderOf(order.id)).stripeRefundId!;
    assert.equal((await refundedRow(order.id, refundA))?.status, "PENDING", "sin Resend en pruebas queda pendiente");

    await failA(order.id, refundA);
    assert.equal((await refundedRow(order.id, refundA))?.status, "CANCELLED", "el aviso de A ya no es cierto");
    const s1 = fakeSender();
    await lib.emails.deliverPending({ orderId: order.id, sender: s1.sender });
    assert.ok(!s1.sent.some((e) => /Refund issued/.test(e.subject)), "no se anuncia el refund fallido");

    const ok = await lib.markRefundedManually(order.id, "re_manualB", { email: "admin@test.local" }, manualB(order.id, order.stripePaymentIntentId!));
    assert.equal(ok.ok, true);
    assert.equal((await refundedRow(order.id, "re_manualB"))?.status, "PENDING", "aviso nuevo para B");
    const s2 = fakeSender();
    await lib.emails.deliverPending({ orderId: order.id, sender: s2.sender });
    assert.equal(s2.sent.filter((e) => /Refund issued/.test(e.subject)).length, 1, "B se anuncia una vez");

    // Repetir el cierre o recibir el evento de B no duplica.
    const again = await lib.markRefundedManually(order.id, "re_manualB", { email: "admin@test.local" }, manualB(order.id, order.stripePaymentIntentId!));
    assert.equal(!again.ok && again.code, 409);
    const okB = wrap({ refunds: { retrieve: async (id: string) => refundObj(id, "succeeded", order.id) } });
    await lib.handleStripeEvent(evt("refund.updated", refundObj("re_manualB", "succeeded", order.id)), okB);
    assert.equal(await db.emailOutbox.count({ where: { orderId: order.id, kind: "ORDER_REFUNDED" } }), 2, "A (anulado) y B");
    assert.equal((await orderOf(order.id)).status, "CANCELLED_REFUNDED");
  });

  await test("aviso de A agotado (FAILED) → A falla → queda anulado (no se puede reintentar); B manual genera su propio aviso", async () => {
    const { order } = await paidFakeOrder("NA2");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
    const refundA = (await orderOf(order.id)).stripeRefundId!;
    await db.emailOutbox.update({ where: { dedupeKey: `order-refunded:${order.id}:${refundA}` }, data: { status: "FAILED", attempts: 8 } });
    await failA(order.id, refundA);
    const rowA = (await refundedRow(order.id, refundA))!;
    assert.equal(rowA.status, "CANCELLED");
    assert.equal(await lib.emails.requeueFailedEmail(rowA.id, "admin@test.local"), false, "Retry no lo revive");
    assert.equal((await lib.markRefundedManually(order.id, "re_manualB2", { email: "admin@test.local" }, manualB(order.id, order.stripePaymentIntentId!, "re_manualB2"))).ok, true);
    assert.equal((await refundedRow(order.id, "re_manualB2"))?.status, "PENDING");
  });

  await test("aviso de A en vuelo (SENDING) cuando A falla: no se pisa; si se retoma tras vencer el lock, se anula sin enviar", async () => {
    const { order } = await paidFakeOrder("NA3");
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN, refundClient(order.id, "succeeded")), "CANCELLED_REFUNDED");
    const refundA = (await orderOf(order.id)).stripeRefundId!;
    const key = `order-refunded:${order.id}:${refundA}`;
    await db.emailOutbox.update({ where: { dedupeKey: key }, data: { status: "SENDING", claimToken: "otro", lockedUntil: new Date(Date.now() + 60_000) } });
    await failA(order.id, refundA);
    assert.equal((await refundedRow(order.id, refundA))?.status, "SENDING", "un envío en vuelo no se pisa");
    const row = await db.emailOutbox.update({ where: { dedupeKey: key }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    const { sent, sender } = fakeSender();
    assert.equal(await lib.emails.deliverEmail(row.id, sender), "cancelled");
    assert.equal(sent.length, 0);
    assert.equal((await refundedRow(order.id, refundA))?.status, "CANCELLED");
  });

  await test("registrar refund manual: 'no existe' en Stripe → 422; caída o timeout de Stripe → 502 reintentable; el pedido no cambia", async () => {
    const order = await failedCancel("MR2");
    const missing = wrap({ refunds: { retrieve: async () => { throw Object.assign(new Error("No such refund"), { code: "resource_missing", statusCode: 404 }); } } });
    const r1 = await lib.markRefundedManually(order.id, "re_nope", { email: "admin@test.local" }, missing);
    assert.equal(!r1.ok && r1.code, 422);
    assert.match(!r1.ok ? r1.error : "", /no refund with that ID/);
    const down = wrap({ refunds: { retrieve: async () => { throw Object.assign(new Error("ETIMEDOUT"), { type: "StripeConnectionError" }); } } });
    const r2 = await lib.markRefundedManually(order.id, "re_x1", { email: "admin@test.local" }, down);
    assert.equal(!r2.ok && r2.code, 502);
    assert.match(!r2.ok ? r2.error : "", /Try again/);
    assert.equal((await orderOf(order.id)).status, "CANCEL_REFUND_FAILED");
  });

  await test("Stripe de prueba real: pedido pagado → dos cancelaciones simultáneas → UN refund real succeeded con metadata.orderId", async () => {
    const { product, order } = await pendingWithPayment("CXR", 5);
    await pay(order.stripePaymentIntentId!);
    assert.equal((await lib.reconcileOrderPayment(order.id)).status, "PAYMENT_CONFIRMED");
    assert.equal(await stockOf(product.id), 4);
    const results = await Promise.all([lib.cancelAndRefund(order.id, ADMIN), lib.cancelAndRefund(order.id, ADMIN)]);
    assert.ok(results.includes("CANCELLED_REFUNDED"), JSON.stringify(results));
    assert.equal(await stockOf(product.id), 5);
    const refunds = await refundsOf(order.stripePaymentIntentId!);
    assert.equal(refunds.length, 1, "un solo refund real");
    assert.equal(refunds[0].status, "succeeded");
    assert.equal(refunds[0].metadata?.orderId, order.id);
    assert.equal(refunds[0].amount, 2000);
    assert.equal(await lib.cancelAndRefund(order.id, ADMIN), "ALREADY_DONE");
    assert.equal((await refundsOf(order.stripePaymentIntentId!)).length, 1);
    assert.equal((await emailsOf(order.id, "ORDER_REFUNDED")).length, 1);
  });

  console.log(`\n${passed} pruebas OK${skipped ? ` (${skipped} omitidas por TEST_ONLY)` : ""}${process.exitCode ? " — HAY FALLAS" : ""}`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
