"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const RESULT_LABEL: Record<string, string> = {
  CANCELLED_REFUNDED: "Order cancelled and fully refunded.",
  REFUND_PENDING: "Order cancelled. The refund is processing in Stripe.",
  CANCEL_REFUND_FAILED: "Order cancelled, but the refund failed. Refund it manually in Stripe.",
  ALREADY_DONE: "This order was already cancelled.",
};

// Cancelar y reembolsar un pedido pagado y no despachado. Con `retry`, reintenta un reembolso pendiente.
export function CancelOrderButton({ orderId, total, retry = false }: { orderId: string; total: string; retry?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    let reason: string | null = null;
    if (!retry) {
      reason = window.prompt(
        `Cancel this order and refund $${total} to the customer?\n\nStock goes back to inventory and the customer gets a cancellation email. This cannot be undone.\n\nReason (optional):`,
        ""
      );
      if (reason === null) return; // el admin pulsó Cancelar en el diálogo
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? { ok: true, text: RESULT_LABEL[data.result] ?? "Done." } : { ok: false, text: data.error ?? "Could not cancel the order." });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Network error. Try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      {message && (
        <div
          className={`px-3 py-2 rounded text-[13px] border ${
            message.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}
      <Button variant="secondary" disabled={loading} loading={loading} onClick={run}>
        {retry ? "Retry refund" : "Cancel & refund"}
      </Button>
      <p className="text-[12px] text-hag-text-2">
        {retry
          ? "The order is cancelled but the refund has not completed yet."
          : "Only for paid orders that have not shipped. Refunds the full amount in Stripe."}
      </p>
    </div>
  );
}
