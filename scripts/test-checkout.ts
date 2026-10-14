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
};

const SHIPPING = { name: "Test Buyer", line1: "100 Main St", line2: null, city: "Miami", state: "FL", zip: "33101" };
let passed = 0;

async function test(name: string, fn: () => Promise<void>) {
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
  };
  const { db, stripe } = lib;

  // ── Datos base ──
  await db.$executeRawUnsafe(`TRUNCATE "OrderItem", "Order", "CartItem", "ProductMedia", "Product", "Category", "User" CASCADE`);
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

  await test("error transitorio de Stripe al crear el refund → queda OVERSELL_REFUND_PENDING (no se marca fallido)", async () => {
    const order = await oversellOrder("RF5");
    const client = wrap({
      refunds: { list: async () => ({ data: [] }), create: async () => { throw new Error("ECONNRESET simulado"); } },
    });
    assert.equal(await lib.handleOversell(order.id, client), "REFUND_PENDING");
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

  console.log(`\n${passed} pruebas OK${process.exitCode ? " — HAY FALLAS" : ""}`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
