// Verificación aislada de HAG-95 v2. No conecta a PostgreSQL ni a Stripe.
import assert from "node:assert/strict";
import type Stripe from "stripe";

type Predicate = { [key: string]: unknown };
function matches(row: Predicate, where: Predicate): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Predicate[]).some((p) => matches(row, p));
    if (key === "AND") return (value as Predicate[]).every((p) => matches(row, p));
    return row[key] === value;
  });
}
function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}
async function main() {
  process.env.STRIPE_SECRET_KEY = "sk_test_audit_offline";
  const { db } = await import("../lib/db");
  const { stripe } = await import("../lib/stripe");
  const { handleStripeEvent } = await import("../lib/stripe-webhook");
  const { applyRefundOutcome } = await import("../lib/oversell");
  const order = {
    id: "audit-v2", orderNumber: "AUDIT", status: "OVERSELL_REFUND_PENDING",
    stripeRefundId: "re_audit", stripePaymentIntentId: "pi_audit",
  };
  const original = {
    findFirst: db.order.findFirst, findUnique: db.order.findUnique,
    findUniqueOrThrow: db.order.findUniqueOrThrow, updateMany: db.order.updateMany,
  };
  Object.assign(db.order, {
    findFirst: async ({ where }: { where: Predicate }) => matches(order, where) ? { ...order } : null,
    findUnique: async ({ where }: { where: Predicate }) => matches(order, where) ? { ...order } : null,
    findUniqueOrThrow: async () => ({ ...order }),
    updateMany: async ({ where, data }: { where: Predicate; data: Predicate }) => {
      if (!matches(order, where)) return { count: 0 };
      Object.assign(order, data);
      return { count: 1 };
    },
  });
  const error = console.error;
  let alerts = 0;
  console.error = (...args: unknown[]) => {
    if (args.map(String).join(" ").includes("[order-emails] REFUND FALLIDO")) alerts++;
  };
  const event = (type: string, status: string): Stripe.Event => ({
    id: `evt_${status}`, type, data: { object: type === "payment_intent.succeeded"
      ? { id: order.stripePaymentIntentId, status: "succeeded" }
      : { id: order.stripeRefundId, status, metadata: { orderId: order.id } } },
  }) as Stripe.Event;
  const paused = (status: string) => {
    const reached = gate(), release = gate();
    const client = { refunds: {
      retrieve: async () => {
        reached.open();
        await release.promise;
        return { id: "re_audit", status, metadata: { orderId: order.id } };
      },
      create: async () => { throw new Error("No debe crear refunds"); },
      list: async () => { throw new Error("No debe listar refunds"); },
    } } as unknown as typeof stripe;
    return { reached, release, client };
  };
  try {
    for (const oversell of [false, true]) {
      for (const failureFirst of [false, true]) {
        order.status = "OVERSELL_REFUND_PENDING";
        alerts = 0;
        const a = paused("succeeded"), b = paused("failed");
        const success = handleStripeEvent(event(oversell ? "payment_intent.succeeded" : "refund.updated", "succeeded"), a.client);
        await a.reached.promise;
        const failure = handleStripeEvent(event("refund.failed", "failed"), b.client);
        await b.reached.promise;
        if (failureFirst) {
          b.release.open(); await failure;
          a.release.open(); await success;
        } else {
          a.release.open(); await success;
          b.release.open(); await failure;
        }
        assert.equal(order.status, "OVERSELL_REFUND_FAILED");
        assert.equal(alerts, 1);
        console.log(`OK carrera: oversell=${oversell}, failureFirst=${failureFirst}, fallo persistido y 1 aviso`);
      }
    }
    order.status = "OVERSELL_REFUND_PENDING";
    alerts = 0;
    const failed = { id: "re_audit", status: "failed" } as Stripe.Refund;
    const results = await Promise.all([applyRefundOutcome(order.id, failed), applyRefundOutcome(order.id, failed)]);
    assert.deepEqual(results.sort(), ["OVERSELL_REFUND_FAILED", "SKIPPED"]);
    assert.equal(alerts, 1);
    order.status = "OVERSELL_REFUND_PENDING";
    assert.equal(await applyRefundOutcome(order.id, { id: "re_other", status: "succeeded" } as Stripe.Refund), "SKIPPED");
    assert.equal(await applyRefundOutcome(order.id, { id: "re_other", status: "failed" } as Stripe.Refund), "SKIPPED");
    assert.equal(order.status, "OVERSELL_REFUND_PENDING");
    console.log("OK duplicado concurrente y rechazo de otro refund (succeeded/failed)");
  } finally {
    console.error = error;
    Object.assign(db.order, original);
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
