"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "OVERSELL_REFUND_PENDING"
  | "OVERSELL_REFUND_FAILED"
  | "CANCELLED_REFUNDED";

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pending Payment",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  OVERSELL_REFUND_PENDING: "Refund Pending",
  OVERSELL_REFUND_FAILED: "Refund Failed",
  CANCELLED_REFUNDED: "Refunded",
};

// Transiciones permitidas según estado actual
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: [], // Solo confirm-payment manual
  PAYMENT_CONFIRMED: ["PROCESSING"],
  PROCESSING: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  OVERSELL_REFUND_PENDING: [],
  OVERSELL_REFUND_FAILED: [],
  CANCELLED_REFUNDED: [],
};

interface OrderStatusSelectProps {
  orderId: string;
  currentStatus: OrderStatus;
}

export function OrderStatusSelect({
  orderId,
  currentStatus,
}: OrderStatusSelectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedNext = ALLOWED_TRANSITIONS[currentStatus];

  if (allowedNext.length === 0) {
    return (
      <div className="text-[14px] text-hag-text-2">
        No status transitions available for {STATUS_LABEL[currentStatus]}
      </div>
    );
  }

  const handleStatusChange = async (newStatus: OrderStatus) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update status");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-[13px]">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {allowedNext.map((status) => (
          <Button
            key={status}
            variant="secondary"
            size="sm"
            disabled={loading}
            onClick={() => handleStatusChange(status)}
          >
            {loading ? "..." : `→ ${STATUS_LABEL[status]}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
