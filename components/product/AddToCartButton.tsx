"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";

interface Props {
  productId: string;
  stock: number;
  quantity: number;
}

export function AddToCartButton({ productId, stock, quantity }: Props) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { refresh, openDrawer } = useCart();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "added" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (stock === 0) {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl text-[15px] font-semibold bg-hag-bg-alt text-hag-text-3 cursor-not-allowed"
      >
        Out of Stock
      </button>
    );
  }

  async function handleClick() {
    if (status === "unauthenticated") {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    setLoading(true);
    setFeedback("idle");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error ?? "Could not add to cart.");
        setFeedback("error");
        setTimeout(() => setFeedback("idle"), 3000);
        return;
      }

      setFeedback("added");
      await refresh();
      openDrawer();
      setTimeout(() => setFeedback("idle"), 2000);
    } catch {
      setFeedback("error");
      setErrorMsg("Network error. Please try again.");
      setTimeout(() => setFeedback("idle"), 3000);
    } finally {
      setLoading(false);
    }
  }

  if (feedback === "error") {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl text-[15px] font-semibold bg-red-50 text-red-600 cursor-default"
      >
        {errorMsg ?? "Error — try again"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || status === "loading"}
      className="w-full py-4 rounded-xl text-[15px] font-bold bg-hag-accent text-white hover:bg-hag-accent-dark transition-colors active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {loading
        ? "Adding…"
        : feedback === "added"
        ? "✓ Added to Cart"
        : `Add to Cart${quantity > 1 ? ` (${quantity})` : ""}`}
    </button>
  );
}
