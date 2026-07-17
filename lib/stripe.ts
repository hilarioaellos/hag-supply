import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

const getStripe = (): Stripe => {
  if (!stripeInstance) {
    const apiKey = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
    stripeInstance = new Stripe(apiKey, {
      apiVersion: "2026-06-24.dahlia",
    });
  }
  return stripeInstance;
};

export const stripe = new Proxy(new Stripe("sk_test_placeholder"), {
  get(target, prop) {
    return getStripe()[prop as keyof Stripe];
  },
}) as Stripe;
