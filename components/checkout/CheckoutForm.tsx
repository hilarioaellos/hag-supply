"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShippingForm, type ShippingValues } from "./ShippingForm";

type Props = {
  states: { code: string; name: string }[];
  defaultName: string;
};

type PaymentStep = { orderId: string; orderNumber: string; clientSecret: string; total: string };

export function CheckoutForm({ states, defaultName }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ShippingValues, string>>>({});
  const [payment, setPayment] = useState<PaymentStep | null>(null);

  async function handleSubmit(shipping: ShippingValues) {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setFieldErrors(data.fields ?? {});
        return;
      }
      // Una orden anterior ya estaba pagada: se confirmó en el servidor.
      if (data.paid) {
        router.push(`/order-confirmation/${data.orderId}`);
        return;
      }
      setPayment(data);
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (payment) {
    return (
      <section className="bg-white border border-hag-border rounded-2xl p-6 flex flex-col gap-3">
        <h2 className="text-[18px] font-bold text-hag-text">Payment</h2>
        <p className="text-[14px] text-hag-text-2">
          Order <span className="font-mono text-hag-text">{payment.orderNumber}</span> · Total ${payment.total}
        </p>
        {/* HAG-94: aquí se monta StripePayment (Stripe Elements) con payment.clientSecret. */}
        <p className="text-[14px] text-hag-text-2">Card payment is not available yet.</p>
      </section>
    );
  }

  return (
    <ShippingForm
      states={states}
      defaultName={defaultName}
      submitting={submitting}
      error={error}
      fieldErrors={fieldErrors}
      onSubmit={handleSubmit}
    />
  );
}
