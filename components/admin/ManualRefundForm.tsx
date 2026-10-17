"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

// Cierra una cancelación cuyo reembolso automático falló, después de reembolsar a mano en Stripe.
export function ManualRefundForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [refundId, setRefundId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/manual-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Could not record the refund.");
      else router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[13px] text-hag-text-2">
        After refunding the full amount in the Stripe dashboard, paste the refund ID here. It is checked against Stripe and the
        customer gets a &quot;Refund issued&quot; email.
      </p>
      <div className="flex gap-2">
        <input
          value={refundId}
          onChange={(e) => setRefundId(e.target.value)}
          placeholder="re_..."
          aria-label="Stripe refund ID"
          className="flex-1 border border-hag-border rounded-lg px-3 py-2 text-[14px]"
        />
        <Button type="submit" variant="secondary" disabled={loading || !refundId.trim()} loading={loading}>
          Mark refunded
        </Button>
      </div>
      {error && <p className="text-[13px] text-red-700">{error}</p>}
    </form>
  );
}
