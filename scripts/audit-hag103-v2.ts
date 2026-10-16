// Verifica correcciones de HAG-103 v2 con handlers reales y almacenamiento simulado.
// No conecta a PostgreSQL, Stripe ni Resend; no envía emails.
import assert from "node:assert/strict";
import type Stripe from "stripe";

type Row = Record<string, unknown>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Row[]).some((p) => matches(row, p));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const op = value as Row;
      const actual = row[key] instanceof Date ? (row[key] as Date).getTime() : row[key] as number;
      if ("lte" in op) return actual <= (op.lte as Date).getTime();
      if ("lt" in op) return actual < (op.lt as Date).getTime();
    }
    return row[key] === value;
  });
}
function apply(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) row[key] = Number(row[key]) + Number(value.increment);
    else if (value && typeof value === "object" && "decrement" in value) row[key] = Number(row[key]) - Number(value.decrement);
    else row[key] = value;
  }
}
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => { open = r; });
  return { promise, open };
}
async function main() {
  process.env.STRIPE_SECRET_KEY = "sk_test_audit_offline";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_audit_offline";
  delete process.env.RESEND_API_KEY;
  const { db } = await import("../lib/db");
  const { stripe } = await import("../lib/stripe");
  const { POST } = await import("../app/api/webhooks/stripe/route");
  const { deliverEmail, EmailNotConfiguredError } = await import("../lib/order-emails");
  const originalOrder = db.order.findUnique;
  const originalOutbox = {
    createMany: db.emailOutbox.createMany, findMany: db.emailOutbox.findMany,
    updateMany: db.emailOutbox.updateMany, findUniqueOrThrow: db.emailOutbox.findUniqueOrThrow,
    update: db.emailOutbox.update,
  };
  try {
    let writes = 0;
    const persisted = new Set<string>();
    Object.assign(db.order, { findUnique: async () => null });
    Object.assign(db.emailOutbox, {
      createMany: async ({ data }: { data: { dedupeKey: string }[] }) => {
        if (++writes === 1) throw new Error("DB transient write failure");
        const before = persisted.size;
        data.forEach((item) => persisted.add(item.dedupeKey));
        return { count: persisted.size - before };
      },
      findMany: async () => [],
    });
    const event = { id: "evt_orphan_audit", type: "payment_intent.succeeded", data: {
      object: { id: "pi_orphan_audit", status: "succeeded", metadata: {} },
    } } as Stripe.Event;
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    const post = () => POST(new Request("http://localhost/api/webhooks/stripe", {
      method: "POST", body: payload, headers: { "stripe-signature": signature },
    }));
    assert.equal((await post()).status, 500);
    assert.equal(persisted.size, 0);
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 200);
    assert.equal(persisted.size, 1);
    console.log("OK A: error al persistir → 500; reintentos → 200 y una fila.");

    const row: Row = {
      id: "email_audit", dedupeKey: "order-confirmation:audit", status: "PENDING", attempts: 0,
      nextAttemptAt: new Date(0), lockedUntil: null, to: "audit@example.invalid",
      subject: "Audit", html: "Audit", text: "Audit", providerMessageId: null,
    };
    Object.assign(db.emailOutbox, {
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if (!matches(row, where)) return { count: 0 };
        apply(row, data); return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...row }),
      update: async ({ where, data }: { where: Row; data: Row }) => {
        assert.ok(matches(row, where)); apply(row, data); return { ...row };
      },
    });
    for (const outcome of ["error", "ok", "not_configured"]) {
      Object.assign(row, { status: "PENDING", attempts: 0, claimToken: null, nextAttemptAt: new Date(0) });
      const reached = gate(), release = gate();
      const old = deliverEmail("email_audit", async () => {
        reached.open(); await release.promise;
        if (outcome === "error") throw new Error("old sender timed out");
        if (outcome === "not_configured") throw new EmailNotConfiguredError("old sender not configured");
        return { id: "provider_success_A" };
      });
      await reached.promise;
      // Simula la expiración mientras A sigue esperando al proveedor.
      row.lockedUntil = new Date(0);
      const bReached = gate(), bRelease = gate();
      const newer = deliverEmail("email_audit", async () => {
        bReached.open(); await bRelease.promise; return { id: "provider_success_B" };
      });
      await bReached.promise;
      const bToken = row.claimToken;
      if (outcome !== "ok") { bRelease.open(); assert.equal(await newer, "sent"); }
      release.open();
      assert.equal(await old, "skipped");
      if (outcome === "ok") {
        assert.equal(row.status, "SENDING");
        assert.equal(row.claimToken, bToken);
        bRelease.open(); assert.equal(await newer, "sent");
      }
      assert.equal(row.status, "SENT");
      assert.equal(row.providerMessageId, "provider_success_B");
      assert.equal(row.attempts, 2);
      console.log(`OK B: resultado antiguo ${outcome} no modifica el reclamo/éxito de B.`);
    }
    Object.assign(row, { status: "PENDING", attempts: 0, claimToken: null, nextAttemptAt: new Date(0) });
    process.env.EMAIL_SEND_TIMEOUT_MS = "30";
    assert.equal(await deliverEmail("email_audit", async () => new Promise<{ id: string }>(() => {})), "retry");
    assert.equal(row.status, "PENDING");
    assert.equal(row.claimToken, null);
    assert.match(String(row.lastError), /tiempo de envío agotado/);
    delete process.env.EMAIL_SEND_TIMEOUT_MS;
    console.log("OK C: proveedor sin respuesta → timeout, retry y reclamo liberado.");
  } finally {
    Object.assign(db.order, { findUnique: originalOrder });
    Object.assign(db.emailOutbox, originalOutbox);
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
