"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "./CartProvider";

interface Props {
  item: {
    id: string;
    quantity: number;
    product: {
      id: string;
      name: string;
      slug: string;
      price: string;
      imageUrls: string[];
      stock: number;
    };
  };
  onLinkClick?: () => void;
  onMutate?: () => void;
}

export function CartItem({ item, onLinkClick, onMutate }: Props) {
  const { refresh } = useCart();
  const [qty, setQty] = useState(item.quantity);
  const [updating, setUpdating] = useState(false);
  const [removing, setRemoving] = useState(false);

  const price = parseFloat(item.product.price);
  const img = item.product.imageUrls[0] ?? "/placeholder-product.svg";
  const max = Math.min(item.product.stock, 10);

  async function updateQty(newQty: number) {
    if (newQty === qty || updating) return;
    const prevQty = qty;
    setUpdating(true);
    setQty(newQty);
    try {
      const res = await fetch("/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.product.id, quantity: newQty }),
      });
      if (!res.ok) {
        setQty(prevQty);
        return;
      }
      await refresh();
      onMutate?.();
    } finally {
      setUpdating(false);
    }
  }

  async function removeItem() {
    setRemoving(true);
    try {
      const res = await fetch(`/api/cart?productId=${item.product.id}`, { method: "DELETE" });
      if (!res.ok) return;
      await refresh();
      onMutate?.();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className={`flex gap-3 items-start transition-opacity ${removing ? "opacity-40" : ""}`}>
      {/* Image */}
      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-hag-border bg-hag-bg-alt">
        <Image src={img} alt={item.product.name} fill className="object-cover" sizes="64px" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Link
          href={`/product/${item.product.slug}`}
          onClick={onLinkClick}
          className="text-[13px] font-semibold text-hag-text line-clamp-2 hover:text-hag-accent transition-colors"
        >
          {item.product.name}
        </Link>

        <p className="text-[12px] text-hag-text-2">${price.toFixed(2)} each</p>

        {/* Quantity selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-hag-border rounded-lg overflow-hidden">
            <button
              onClick={() => updateQty(qty - 1)}
              disabled={qty <= 1 || updating}
              className="w-7 h-7 flex items-center justify-center text-hag-text hover:bg-hag-bg-alt disabled:opacity-40 text-[14px]"
            >
              −
            </button>
            <span className="w-7 text-center text-[13px] font-semibold text-hag-text">
              {qty}
            </span>
            <button
              onClick={() => updateQty(qty + 1)}
              disabled={qty >= max || updating}
              className="w-7 h-7 flex items-center justify-center text-hag-text hover:bg-hag-bg-alt disabled:opacity-40 text-[14px]"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Right side: total + remove */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className="text-[14px] font-bold text-hag-text">
          ${(price * qty).toFixed(2)}
        </span>
        <button
          onClick={removeItem}
          disabled={removing}
          className="text-[11px] text-hag-text-3 hover:text-hag-sale transition-colors disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
