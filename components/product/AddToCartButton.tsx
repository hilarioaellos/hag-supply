"use client";

import { useState } from "react";

interface Props {
  productId: string;
  stock: number;
  quantity: number;
}

export function AddToCartButton({ stock, quantity }: Props) {
  const [added, setAdded] = useState(false);

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

  const handleClick = () => {
    // Cart API wired up in HAG-14
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <button
      onClick={handleClick}
      className="w-full py-4 rounded-xl text-[15px] font-bold bg-hag-accent text-white hover:bg-hag-accent-dark transition-colors active:scale-[0.98]"
    >
      {added ? "✓ Added to Cart" : `Add to Cart${quantity > 1 ? ` (${quantity})` : ""}`}
    </button>
  );
}
