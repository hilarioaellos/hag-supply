"use client";

import { useRouter } from "next/navigation";
import { CartItem } from "@/components/cart/CartItem";

interface CartItemData {
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
}

interface Props {
  items: CartItemData[];
}

export function CartPageClient({ items }: Props) {
  const router = useRouter();

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-5">
      {items.map((item) => (
        <div key={item.id} className="bg-white border border-hag-border rounded-2xl p-5">
          <CartItem
            item={item}
            onMutate={() => router.refresh()}
          />
        </div>
      ))}
    </div>
  );
}
