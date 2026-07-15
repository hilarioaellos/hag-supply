"use client";

import { useCart } from "@/components/cart/CartProvider";

export function CartButton() {
  const { count, openDrawer } = useCart();

  return (
    <button
      onClick={openDrawer}
      className="flex flex-col items-center gap-0.5 text-hag-text cursor-pointer relative"
      aria-label="Open cart"
    >
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <rect x="4" y="7" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <line x1="7.5" y1="7" x2="7.5" y2="4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="14.5" y1="7" x2="14.5" y2="4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="19" r="1.3" fill="currentColor" />
        <circle cx="14" cy="19" r="1.3" fill="currentColor" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-2 bg-hag-accent text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
          {count > 99 ? "99+" : count}
        </span>
      )}
      <span className="text-[11px] font-medium">Cart</span>
    </button>
  );
}
