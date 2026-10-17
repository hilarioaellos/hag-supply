export const dynamic = "force-dynamic";

import Link from "next/link";
import { db } from "@/lib/db";
import { getOutboxHealth, OVERDUE_AFTER_MS } from "@/lib/order-emails";
import { STORE_TIME_ZONE } from "@/lib/order-number";
import { RetryEmailButton } from "@/components/admin/RetryEmailButton";

// HAG-121: bandeja de salida de emails. Fallidos (con reintento manual), pendientes atrasados y últimos enviados.

const KIND_LABEL: Record<string, string> = {
  ORDER_CONFIRMATION: "Order confirmation",
  ADMIN_NEW_ORDER: "New order (owner)",
  ADMIN_ALERT: "Admin alert",
  ORDER_CANCELLED: "Order cancelled",
  ORDER_REFUNDED: "Refund issued",
};

const fmt = (d: Date | null) =>
  d ? d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: STORE_TIME_ZONE }) : "—";

export default async function AdminEmailsPage() {
  const now = new Date();
  const [health, failed, overdue, recent] = await Promise.all([
    getOutboxHealth(now),
    db.emailOutbox.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.emailOutbox.findMany({
      where: {
        OR: [
          { status: "PENDING", nextAttemptAt: { lt: new Date(now.getTime() - OVERDUE_AFTER_MS) } },
          { status: "SENDING", lockedUntil: { lt: now } },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
      take: 100,
    }),
    db.emailOutbox.findMany({ where: { status: "SENT" }, orderBy: { sentAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[22px] font-bold text-hag-text">Emails</h2>
        <p className="text-[13px] text-hag-text-2 mt-1">
          Every email is saved here before it is sent and retried automatically. Failed emails ran out of automatic
          retries: fix the cause (for example the email provider), then press Retry. Retry sends to the same address:
          if the address itself is wrong, contact the customer from your own inbox instead of retrying.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Failed" value={health.failed} alert={health.failed > 0} />
        <Stat label="Overdue (pending > 30 min)" value={health.overdue} alert={health.overdue > 0} />
        <Stat label="Sent (latest shown below)" value={recent.length} />
      </div>

      <Section title={`Failed (${failed.length})`} empty="No failed emails.">
        {failed.map((e) => (
          <Row key={e.id} email={e}>
            <RetryEmailButton emailId={e.id} timedOut={/tiempo de envío agotado/.test(e.lastError ?? "")} />
          </Row>
        ))}
      </Section>

      <Section title={`Overdue (${overdue.length})`} empty="Nothing overdue.">
        {overdue.map((e) => (
          <Row key={e.id} email={e}>
            <span className="text-[12px] text-hag-text-2">Next try: {fmt(e.nextAttemptAt)}</span>
          </Row>
        ))}
      </Section>

      <Section title="Recently sent" empty="No emails sent yet.">
        {recent.map((e) => (
          <Row key={e.id} email={e}>
            <span className="text-[12px] text-hag-text-2">{fmt(e.sentAt)}</span>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`border rounded-2xl p-5 ${alert ? "bg-red-50 border-red-300" : "bg-white border-hag-border"}`}>
      <div className={`text-[13px] font-medium ${alert ? "text-red-800" : "text-hag-text-2"}`}>{label}</div>
      <div className={`text-[28px] font-bold mt-1 ${alert ? "text-red-900" : "text-hag-text"}`}>{value}</div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="bg-white border border-hag-border rounded-2xl p-6">
      <h3 className="text-[16px] font-bold text-hag-text mb-4">{title}</h3>
      {children.length === 0 ? <p className="text-[13px] text-hag-text-3">{empty}</p> : <div className="divide-y divide-hag-border">{children}</div>}
    </section>
  );
}

type EmailRow = {
  kind: string;
  to: string;
  subject: string;
  orderId: string | null;
  attempts: number;
  lastError: string | null;
  requeueCount: number;
  requeuedBy: string | null;
  requeuedAt: Date | null;
};

function Row({ email, children }: { email: EmailRow; children: React.ReactNode }) {
  return (
    <div className="py-3 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-hag-text truncate">{email.subject}</div>
        <div className="text-[12px] text-hag-text-2 mt-0.5">
          {KIND_LABEL[email.kind] ?? email.kind} · to {email.to} · attempts {email.attempts}
          {email.orderId && (
            <>
              {" · "}
              <Link href={`/admin/orders/${email.orderId}`} className="text-hag-accent hover:underline">order</Link>
            </>
          )}
        </div>
        {email.lastError && <div className="text-[12px] text-red-700 mt-1 break-words">{email.lastError}</div>}
        {email.requeueCount > 0 && (
          <div className="text-[11px] text-hag-text-3 mt-1">
            Retried manually {email.requeueCount}× — last by {email.requeuedBy} on {fmt(email.requeuedAt)}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
