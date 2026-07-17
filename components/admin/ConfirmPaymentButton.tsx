"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface ConfirmPaymentButtonProps {
  orderId: string;
}

export function ConfirmPaymentButton({ orderId }: ConfirmPaymentButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (
      !confirm(
        "Confirm this payment manually? This will mark the order as PAYMENT_CONFIRMED and decrement stock."
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/confirm-payment`,
        {
          method: "POST",
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to confirm payment");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-[13px]">
          {error}
        </div>
      )}

      <Button
        variant="secondary"
        disabled={loading}
        onClick={handleConfirm}
      >
        {loading ? "Confirming..." : "Confirm Payment Manually"}
      </Button>
      <p className="text-[12px] text-hag-text-2">
        Only available for pending orders with Stripe payment intent verified.
      </p>
    </div>
  );
}
