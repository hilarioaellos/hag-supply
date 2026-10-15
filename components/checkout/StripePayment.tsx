"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { Button } from "@/components/ui/Button";

// Una sola carga de Stripe.js por página. Sin la clave pública el pago no se puede mostrar.
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type Props = {
  orderId: string;
  clientSecret: string;
  total: string;
};

// Payment Element de Stripe: los datos de la tarjeta nunca pasan por nuestro servidor (PCI).
// Tras confirmar, Stripe redirige a /order-confirmation/[id], que reconcilia el pago en el servidor.
export function StripePayment({ orderId, clientSecret, total }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(
    stripePromise ? null : "Card payments are not configured. Please contact us to complete your order."
  );

  useEffect(() => {
    if (!stripePromise || !mountRef.current) return;
    let cancelled = false;
    let destroy: (() => void) | null = null;

    stripePromise
      .then((stripe) => {
        if (cancelled || !stripe || !mountRef.current) return;
        const elements = stripe.elements({ clientSecret, appearance: { theme: "stripe" } });
        // Solo se envía dentro de EE. UU.: país de facturación preseleccionado (el cliente puede cambiarlo).
        const paymentElement = elements.create("payment", {
          layout: "tabs",
          defaultValues: { billingDetails: { address: { country: "US" } } },
        });
        paymentElement.on("ready", () => setReady(true));
        paymentElement.mount(mountRef.current);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        destroy = () => paymentElement.destroy();
      })
      .catch(() => setError("We couldn't load the payment form. Check your connection and reload the page."));

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [clientSecret]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;

    setPaying(true);
    setError(null);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/order-confirmation/${orderId}` },
      });
      // Si llega aquí no hubo redirección: Stripe rechazó o faltan datos. En éxito el navegador ya se fue.
      setError(
        error.type === "card_error" || error.type === "validation_error"
          ? error.message ?? "Your payment could not be completed."
          : error.code === "payment_intent_authentication_failure"
            ? "We couldn't verify your card with your bank. Please try again or use a different card."
            : "Something went wrong with the payment. Please try again."
      );
    } catch {
      // Excepción de Stripe.js o de red: el pago pudo no haberse enviado; se permite reintentar.
      setError("We couldn't reach the payment provider. Check your connection and try again.");
    } finally {
      setPaying(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div ref={mountRef} className="min-h-[120px]" />
      {!ready && !error && <p className="text-[13px] text-hag-text-3">Loading secure payment form…</p>}
      {error && (
        <p role="alert" className="text-[14px] text-hag-sale">{error}</p>
      )}
      <Button type="submit" size="lg" loading={paying} disabled={!ready || paying} className="w-full">
        Pay ${total}
      </Button>
      <p className="text-[12px] text-hag-text-3 text-center">Payments are processed securely by Stripe.</p>
    </form>
  );
}
