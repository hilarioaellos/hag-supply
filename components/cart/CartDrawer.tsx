"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "./CartProvider";
import { Button } from "@/components/ui/Button";

export function CartDrawer() {
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
          <h2 className="text-base font-700 text-hag-text">
            Your Cart {items.length > 0 && <span className="text-hag-text-3 font-400">({items.length})</span>}
          </h2>
          <button onClick={closeDrawer} className="text-hag-text-3 hover:text-hag-text text-lg">✕</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <p className="text-hag-text-2">Your cart is empty.</p>
              <Button variant="secondary" onClick={closeDrawer} size="sm">
                Start Shopping
              </Button>
            </div>
          ) : (
            items.map((item) => {
              const img = item.product.imageUrls[0] ?? "/placeholder-product.svg";
              return (
                <div key={item.id} className="flex gap-3 items-start">
                  <Image
                    src={img}
                    alt={item.product.name}
                    width={64}
                    height={64}
                    className="rounded-lg object-cover border border-hag-border"
                  />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/product/${item.product.slug}`}
                      onClick={closeDrawer}
                      className="text-sm font-600 text-hag-text line-clamp-2 hover:text-hag-accent"
                    >
                      {item.product.name}
                    </Link>
                    <p className="text-sm text-hag-text-2 mt-0.5">
                      ${parseFloat(item.product.price).toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-700 text-hag-text whitespace-nowrap">
                    ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="px-6 py-4 border-t border-hag-border flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-hag-text-2">Subtotal</span>
              <span className="font-700 text-hag-text">${subtotal}</span>
            </div>
            <p className="text-xs text-hag-text-3">🚚 Free shipping on all orders</p>
            <Link href="/checkout" onClick={closeDrawer}>
              <Button className="w-full">Proceed to Checkout</Button>
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
