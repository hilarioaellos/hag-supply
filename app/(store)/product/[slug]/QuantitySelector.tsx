"use client";

import { useState } from "react";
import { AddToCartButton } from "@/components/product/AddToCartButton";

interface Props {
  productId: string;
  stock: number;
}

export function QuantitySelector({ productId, stock }: Props) {
  const [qty, setQty] = useState(1);
  const max = Math.min(stock, 10);

  return (
    <div className="flex flex-col gap-3">
      {stock > 0 && (
        <div className="flex items-center gap-3">
          <p className="text-[13px] font-semibold text-hag-text-2">Quantity</p>
          <div className="flex items-center border border-hag-border rounded-lg overflow-hidden">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="w-9 h-9 flex items-center justify-center text-[18px] text-hag-text hover:bg-hag-bg-alt disabled:opacity-40 transition-colors"
            >
              −
            </button>
            <span className="w-10 text-center text-[14px] font-semibold text-hag-text">
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => Math.min(max, q + 1))}
              disabled={qty >= max}
              className="w-9 h-9 flex items-center justify-center text-[18px] text-hag-text hover:bg-hag-bg-alt disabled:opacity-40 transition-colors"
            >
              +
            </button>
          </div>
        </div>
      )}
      <AddToCartButton productId={productId} stock={stock} quantity={qty} />
    </div>
  );
}
