// Auditoría aislada v2. Temporizadores reales a escala 1/10; sin enviar emails ni conectar a servicios.
import assert from "node:assert/strict";
type Row = Record<string, any>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((p) => matches(row, p));
    if (v && typeof v === "object") {
      if ("lt" in v) return row[k] !== null && row[k] < v.lt;
      if ("lte" in v) return row[k] !== null && row[k] <= v.lte;
    }
    return row[k] === v;
  });
}
async function main() {
  process.env.STRIPE_SECRET_KEY = "sk_test_audit_offline";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_audit_offline";
  process.env.RESEND_API_KEY = "re_audit_offline";
  process.env.CRON_SECRET = "audit_offline";
  process.env.NEXTAUTH_URL = "https://supply.hagpartner.com";
  process.env.EMAIL_SEND_TIMEOUT_MS = "1500";
  process.env.EMAIL_MIN_SEND_WINDOW_MS = "300";
  process.env.EMAIL_REQUEST_WINDOW_MS = "4500";
  const { db } = await import("../lib/db");
  const { stripe } = await import("../lib/stripe");
  const cron = await import("../app/api/cron/email-outbox/route");
  const webhook = await import("../app/api/webhooks/stripe/route");
  const { requeueFailedEmail, deliverEmail, deliverPending, withEmailDeadline } = await import("../lib/order-emails");
  const original = Object.fromEntries(["findMany", "findFirst", "count", "updateMany", "findUniqueOrThrow", "createMany"].map((k) => [k, (db.emailOutbox as any)[k]]));
  const originalFind = db.order.findUnique;
  const realFetch = globalThis.fetch, realNow = Date.now;
  let rows: Row[] = [], durations: number[] = [], sends = 0, readDelay = 0;
  const email = (id: string, status = "PENDING"): Row => ({
    id, status, dedupeKey: id, attempts: 0, nextAttemptAt: new Date(0), lockedUntil: null,
    claimToken: null, createdAt: new Date(0), requeueCount: 0, to: "audit@example.invalid",
    subject: "Audit", html: "Audit", text: "Audit",
  });
  Object.assign(db.order, { findUnique: async () => null });
  Object.assign(db.emailOutbox, {
    findMany: async ({ where, take }: Row) => rows.filter((r) => matches(r, where)).slice(0, take).map((r) => ({ id: r.id })),
    count: async ({ where }: Row) => rows.filter((r) => matches(r, where)).length,
    findFirst: async ({ where }: Row) => rows.find((r) => matches(r, where)) ?? null,
    findUniqueOrThrow: async ({ where }: Row) => {
      if (readDelay) await new Promise((r) => setTimeout(r, readDelay));
      return { ...rows.find((r) => r.id === where.id)! };
    },
    updateMany: async ({ where, data }: Row) => {
      const matched = rows.filter((r) => matches(r, where));
      for (const row of matched) for (const [k, v] of Object.entries(data)) {
        row[k] = v && typeof v === "object" && "increment" in v ? row[k] + Number(v.increment)
          : v && typeof v === "object" && "decrement" in v ? row[k] - Number(v.decrement) : v;
      }
      return { count: matched.length };
    },
    createMany: async ({ data }: Row) => {
      let count = 0;
      for (const d of data) if (!rows.some((r) => r.dedupeKey === d.dedupeKey)) {
        rows.push({ ...email(`queued_${rows.length}`), ...d }); count++;
      }
      return { count };
    },
  });
  globalThis.fetch = async () => {
    const delay = durations[sends] ?? 0;
    const id = ++sends;
    await new Promise((r) => setTimeout(r, delay));
    return Response.json({ id: `offline_${id}` });
  };
  try {
    rows = [email("failed", "FAILED")];
    const requeues = await Promise.all([requeueFailedEmail("failed", "a@example.invalid"), requeueFailedEmail("failed", "b@example.invalid")]);
    assert.deepEqual(requeues.sort(), [false, true]);
    assert.equal(rows[0].requeueCount, 1);
    assert.equal(rows[0].requeuedBy, "a@example.invalid");
    console.log("OK HAG-121: un solo reencolado, contador y autor conservados.");

    rows = Array.from({ length: 6 }, (_, i) => email(`cron_${i}`));
    rows.push(email("failed_health", "FAILED"));
    sends = 0; durations = [1300, 1300, 1300, 1490, 1490];
    let started = realNow();
    const cronResponse = await cron.GET(new Request("http://localhost/api/cron/email-outbox", { headers: { authorization: "Bearer audit_offline" } }));
    assert.equal(cronResponse.status, 200);
    let elapsed = realNow() - started;
    assert.ok(elapsed < 5500, `cron tardó ${elapsed}`);
    assert.ok(!rows.some((r) => r.status === "SENDING"));
    assert.ok(rows.some((r) => r.dedupeKey.startsWith("admin:outbox-health:")));
    assert.ok(rows.some((r) => r.status === "PENDING" && r.attempts === 0));
    console.log(`OK cron: ${elapsed} ms reales a escala 1/10, aviso persistido y pendientes intactos.`);
    // Recuperación en la siguiente ejecución, cuando vence el backoff del envío recortado.
    for (const row of rows) if (row.status === "PENDING") row.nextAttemptAt = new Date(0);
    durations = []; sends = 0;
    assert.equal((await cron.GET(new Request("http://localhost/api/cron/email-outbox", { headers: { authorization: "Bearer audit_offline" } }))).status, 200);
    assert.ok(rows.every((r) => r.status === "SENT" || r.status === "FAILED"));
    console.log("OK recuperación cron: todos los pendientes, incluido el aviso diario, enviados con proveedor sano.");

    rows = Array.from({ length: 4 }, (_, i) => email(`webhook_${i}`));
    sends = 0; durations = [790, 1490, 1490];
    process.env.EMAIL_REQUEST_WINDOW_MS = "2000";
    const event = { id: "evt_offline", type: "payment_intent.succeeded", livemode: true,
      data: { object: { id: "pi_offline", status: "succeeded", metadata: { origin: "foreign.example" } } } };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    started = realNow();
    const response = await webhook.POST(new Request("http://localhost/api/webhooks/stripe", {
      method: "POST", body: payload, headers: { "stripe-signature": signature },
    }));
    assert.equal(response.status, 200);
    assert.ok(rows.some((r) => r.dedupeKey === "admin:orphan-payment:pi_offline"));
    elapsed = realNow() - started;
    assert.ok(elapsed < 3000, `webhook tardó ${elapsed}`);
    assert.ok(!rows.some((r) => r.status === "SENDING"));
    console.log(`OK webhook/HAG-125: ${elapsed} ms reales a escala 1/10, live de origen ajeno encola aviso.`);

    rows = [email("slow_read")]; readDelay = 400;
    process.env.EMAIL_MIN_SEND_WINDOW_MS = "100";
    const before = sends;
    assert.equal(await withEmailDeadline(realNow() + 300, () => deliverEmail("slow_read")), "deferred");
    assert.equal(rows[0].attempts, 0);
    assert.equal(rows[0].claimToken, null);
    assert.equal(rows[0].status, "PENDING");
    assert.equal(sends, before);
    readDelay = 0;
    console.log("OK lectura lenta: reclamo liberado, intento devuelto y proveedor no llamado.");

    rows = [email("nested")]; sends = 0; durations = [600];
    started = realNow();
    const result = await withEmailDeadline(started + 300, () => withEmailDeadline(started + 60000, () => deliverPending({ budgetMs: 60000 })));
    assert.equal(result.retry, 1);
    assert.ok(realNow() - started < 700);
    assert.equal(rows[0].claimToken, null);
    console.log("OK deadline anidado: no amplía la ventana exterior.");
  } finally {
    Date.now = realNow; globalThis.fetch = realFetch;
    Object.assign(db.emailOutbox, original); Object.assign(db.order, { findUnique: originalFind });
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
