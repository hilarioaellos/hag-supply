"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

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

interface CartContextValue {
  items: CartItemData[];
  count: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  count: 0,
  drawerOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  refresh: async () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemData[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/cart");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // silently fail if not authenticated
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        count,
        drawerOpen,
        openDrawer: () => setDrawerOpen(true),
        closeDrawer: () => setDrawerOpen(false),
        refresh,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
