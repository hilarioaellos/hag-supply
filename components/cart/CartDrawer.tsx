"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCart } from "./CartProvider";
import { CartItem } from "./CartItem";
import { Button } from "@/components/ui/Button";

export function CartDrawer() {
  const router = useRouter();
  const { status } = useSession();
  const { items, drawerOpen, closeDrawer, refresh } = useCart();

  useEffect(() => {
    if (drawerOpen) refresh();
  }, [drawerOpen, refresh]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  const subtotal = items
    .reduce((sum, i) => sum + parseFloat(i.product.price) * i.quantity, 0)
    .toFixed(2);

  const handleCheckoutClick = () => {
    if (status === "authenticated") {
      router.push("/checkout");
    } else if (status === "unauthenticated") {
      router.push("/login?redirect=/checkout");
    }
  };

  return (
    <>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={closeDrawer}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-[420px] bg-hag-bg z-50 shadow-2xl flex flex-col transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hag-border">
          <h2 className="text-[15px] font-bold text-hag-text">
            Your Cart{" "}
            {items.length > 0 && (
              <span className="text-hag-text-3 font-normal">({items.length})</span>
            )}
          </h2>
          <button
            onClick={closeDrawer}
            className="text-hag-text-3 hover:text-hag-text text-lg leading-none"
            aria-label="Close cart"
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <span className="text-[40px]">🛒</span>
              <p className="text-[15px] font-semibold text-hag-text">Your cart is empty</p>
              <p className="text-[13px] text-hag-text-2">Add products to get started.</p>
              <Button variant="secondary" onClick={closeDrawer} size="sm">
                Start Shopping
              </Button>
            </div>
          ) : (
            items.map((item) => (
              <CartItem key={item.id} item={item} onLinkClick={closeDrawer} />
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-6 py-5 border-t border-hag-border flex flex-col gap-3">
            <div className="flex justify-between text-[14px]">
              <span className="text-hag-text-2">Subtotal</span>
              <span className="font-bold text-hag-text">${subtotal}</span>
            </div>
            <p className="text-[12px] text-hag-text-3">🚚 Free shipping on all orders</p>
            <Button
              className="w-full"
              disabled={status === "loading"}
              onClick={() => {
                closeDrawer();
                handleCheckoutClick();
              }}
            >
              Proceed to Checkout
            </Button>
            <Link
              href="/cart"
              onClick={closeDrawer}
              className="text-center text-[13px] text-hag-accent hover:text-hag-accent-dark transition-colors"
            >
              View full cart
            </Link>
            <Button variant="ghost" size="sm" onClick={closeDrawer} className="w-full">
              Continue Shopping
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
