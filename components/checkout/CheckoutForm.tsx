"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShippingForm, type ShippingValues } from "./ShippingForm";
import { StripePayment } from "./StripePayment";

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
  const [lastShipping, setLastShipping] = useState<ShippingValues | null>(null);

  async function handleSubmit(shipping: ShippingValues) {
    setLastShipping(shipping);
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
      <section className="bg-white border border-hag-border rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-bold text-hag-text">Payment</h2>
            <p className="text-[14px] text-hag-text-2 mt-1">
              Order <span className="font-mono text-hag-text">{payment.orderNumber}</span>
            </p>
          </div>
          {/* Volver a la dirección: el próximo envío cancela este PaymentIntent y crea otro (caso B). */}
          <button
            type="button"
            onClick={() => setPayment(null)}
            className="text-[13px] text-hag-accent hover:text-hag-accent-dark transition-colors shrink-0"
          >
            Edit address
          </button>
        </div>
        <StripePayment orderId={payment.orderId} clientSecret={payment.clientSecret} total={payment.total} />
      </section>
    );
  }

  return (
    <ShippingForm
      states={states}
      defaultName={defaultName}
      initialValues={lastShipping}
      submitting={submitting}
      error={error}
      fieldErrors={fieldErrors}
      onSubmit={handleSubmit}
    />
  );
}
