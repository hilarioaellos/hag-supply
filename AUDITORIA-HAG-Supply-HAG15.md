# HAG Supply — Auditoria HAG-15
**Fecha:** 17 julio 2026
**Scope:** CartDrawer completo + CartItem + página /cart
**Base aprobada:** 02e4a16 (HAG-14)
**Estado working tree:** sin commit (pendiente GO)
**`tsc --noEmit`:** PASS

---

## Qué se construyó

1. `components/cart/CartItem.tsx` — item con imagen, nombre, selector de cantidad (PATCH), botón Remove (DELETE)
2. `components/cart/CartDrawer.tsx` — reemplaza versión sin acciones con CartItem integrado, auth en botón checkout, link "View full cart"
3. `app/(store)/cart/page.tsx` — página completa con layout dos columnas: lista de items + sidebar de resumen
4. `app/(store)/cart/CartPageClient.tsx` — Client Component que pasa `router.refresh` como `onMutate` a CartItem para actualizar datos del Server Component tras mutaciones

---

## Verificaciones

```
tsc --noEmit                        → PASS
/cart  (sin sesión)                 → 307 → /login?redirect=/cart
```

---

## Archivos nuevos o modificados

---

## components/cart/CartItem.tsx (nuevo)

```tsx
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
    setUpdating(true);
    setQty(newQty);
    try {
      await fetch("/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.product.id, quantity: newQty }),
      });
      await refresh();
      onMutate?.();
    } finally {
      setUpdating(false);
    }
  }

  async function removeItem() {
    setRemoving(true);
    try {
      await fetch(`/api/cart?productId=${item.product.id}`, { method: "DELETE" });
      await refresh();
      onMutate?.();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className={`flex gap-3 items-start transition-opacity ${removing ? "opacity-40" : ""}`}>
      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-hag-border bg-hag-bg-alt">
        <Image src={img} alt={item.product.name} fill className="object-cover" sizes="64px" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Link
          href={`/product/${item.product.slug}`}
          onClick={onLinkClick}
          className="text-[13px] font-semibold text-hag-text line-clamp-2 hover:text-hag-accent transition-colors"
        >
          {item.product.name}
        </Link>
        <p className="text-[12px] text-hag-text-2">${price.toFixed(2)} each</p>

        <div className="flex items-center border border-hag-border rounded-lg overflow-hidden w-fit">
          <button
            onClick={() => updateQty(qty - 1)}
            disabled={qty <= 1 || updating}
            className="w-7 h-7 flex items-center justify-center text-hag-text hover:bg-hag-bg-alt disabled:opacity-40 text-[14px]"
          >
            −
          </button>
          <span className="w-7 text-center text-[13px] font-semibold text-hag-text">{qty}</span>
          <button
            onClick={() => updateQty(qty + 1)}
            disabled={qty >= max || updating}
            className="w-7 h-7 flex items-center justify-center text-hag-text hover:bg-hag-bg-alt disabled:opacity-40 text-[14px]"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className="text-[14px] font-bold text-hag-text">${(price * qty).toFixed(2)}</span>
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
```

---

## components/cart/CartDrawer.tsx (modificado — CartItem, auth checkout, "View full cart")

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCart } from "./CartProvider";
import { CartItem } from "./CartItem";
import { Button } from "@/components/ui/Button";

export function CartDrawer() {
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

  const checkoutHref =
    status === "authenticated" ? "/checkout" : "/login?redirect=/checkout";

  return (
    <>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={closeDrawer} />
      )}

      <div className={`fixed top-0 right-0 h-full w-[420px] bg-hag-bg z-50 shadow-2xl flex flex-col transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-hag-border">
          <h2 className="text-[15px] font-bold text-hag-text">
            Your Cart{" "}
            {items.length > 0 && <span className="text-hag-text-3 font-normal">({items.length})</span>}
          </h2>
          <button onClick={closeDrawer} className="text-hag-text-3 hover:text-hag-text text-lg leading-none" aria-label="Close cart">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <span className="text-[40px]">🛒</span>
              <p className="text-[15px] font-semibold text-hag-text">Your cart is empty</p>
              <p className="text-[13px] text-hag-text-2">Add products to get started.</p>
              <Button variant="secondary" onClick={closeDrawer} size="sm">Start Shopping</Button>
            </div>
          ) : (
            items.map((item) => (
              <CartItem key={item.id} item={item} onLinkClick={closeDrawer} />
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="px-6 py-5 border-t border-hag-border flex flex-col gap-3">
            <div className="flex justify-between text-[14px]">
              <span className="text-hag-text-2">Subtotal</span>
              <span className="font-bold text-hag-text">${subtotal}</span>
            </div>
            <p className="text-[12px] text-hag-text-3">🚚 Free shipping on all orders</p>
            <Link href={checkoutHref} onClick={closeDrawer} className="block">
              <Button className="w-full">Proceed to Checkout</Button>
            </Link>
            <Link href="/cart" onClick={closeDrawer} className="text-center text-[13px] text-hag-accent hover:text-hag-accent-dark transition-colors">
              View full cart
            </Link>
            <Button variant="ghost" size="sm" onClick={closeDrawer} className="w-full">Continue Shopping</Button>
          </div>
        )}
      </div>
    </>
  );
}
```

---

## app/(store)/cart/page.tsx (nuevo)

```tsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { CartPageClient } from "./CartPageClient";

async function getCartItems(userId: string) {
  const items = await db.cartItem.findMany({
    where: { userId },
    include: {
      product: {
        select: { id: true, name: true, slug: true, price: true, imageUrls: true, stock: true },
      },
    },
    orderBy: { addedAt: "asc" },
  });
  return items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    product: { ...item.product, price: item.product.price.toString() },
  }));
}

export default async function CartPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/cart");

  const items = await getCartItems(session.user.id);

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-hag-bg flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-4">
          <span className="text-[56px]">🛒</span>
          <h1 className="text-[26px] font-bold text-hag-text">Your cart is empty</h1>
          <p className="text-[15px] text-hag-text-2">Add products to get started.</p>
          <Link href="/" className="mt-2 px-6 py-3 rounded-xl bg-hag-accent text-white text-[15px] font-semibold hover:bg-hag-accent-dark transition-colors">
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = items.reduce((sum, i) => sum + parseFloat(i.product.price) * i.quantity, 0);

  return (
    <div className="min-h-screen bg-hag-bg">
      <div className="px-12 py-10 max-w-[1100px] mx-auto">
        <h1 className="text-[28px] font-bold text-hag-text mb-8">
          Your Cart{" "}
          <span className="text-hag-text-3 font-normal text-[20px]">
            ({items.length} {items.length === 1 ? "item" : "items"})
          </span>
        </h1>

        <div className="flex gap-10 items-start">
          <CartPageClient items={items} />

          <aside className="w-[300px] shrink-0 sticky top-[80px]">
            <div className="bg-white border border-hag-border rounded-2xl p-6 flex flex-col gap-4">
              <h2 className="text-[16px] font-bold text-hag-text">Order Summary</h2>
              <div className="flex flex-col gap-2 text-[14px]">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-hag-text-2">
                    <span className="line-clamp-1 flex-1 mr-2">{item.product.name} ×{item.quantity}</span>
                    <span className="shrink-0 font-medium text-hag-text">
                      ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-hag-border pt-3 flex justify-between text-[15px] font-bold text-hag-text">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <p className="text-[12px] text-hag-text-2">🚚 Free shipping on all orders</p>
              <Link href="/checkout" className="block w-full py-3.5 rounded-xl bg-hag-accent text-white text-[15px] font-bold text-center hover:bg-hag-accent-dark transition-colors">
                Proceed to Checkout
              </Link>
              <Link href="/" className="block text-center text-[13px] text-hag-accent hover:text-hag-accent-dark transition-colors">
                ← Continue Shopping
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
```

---

## app/(store)/cart/CartPageClient.tsx (nuevo)

```tsx
"use client";

import { useRouter } from "next/navigation";
import { CartItem } from "@/components/cart/CartItem";

interface CartItemData {
  id: string;
  quantity: number;
  product: { id: string; name: string; slug: string; price: string; imageUrls: string[]; stock: number };
}

export function CartPageClient({ items }: { items: CartItemData[] }) {
  const router = useRouter();

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-5">
      {items.map((item) => (
        <div key={item.id} className="bg-white border border-hag-border rounded-2xl p-5">
          <CartItem item={item} onMutate={() => router.refresh()} />
        </div>
      ))}
    </div>
  );
}
```

---

## Notas para el auditor

### Patrón doble refresh en CartItem

CartItem llama primero `await refresh()` (del CartProvider — actualiza el badge del header), luego `onMutate?.()`. Para el drawer, `onMutate` es undefined — solo se actualiza el contexto. Para la página `/cart`, `onMutate = router.refresh` — re-ejecuta los Server Components y actualiza los totales del sidebar.

### Checkout href dinámico en CartDrawer

`checkoutHref` depende de `status` de `useSession()`. Si `status === "authenticated"` → `/checkout`; cualquier otro estado → `/login?redirect=/checkout`. Esto cubre el caso donde el usuario cierra sesión con el drawer abierto.

### CartPageClient recibe items del Server Component

Los items se pasan como prop desde el Server Component para el render inicial. Después de mutaciones, `router.refresh()` hace que Next.js re-renderice el Server Component y pase los items actualizados al Client Component. El sidebar con totales se actualiza junto.

### Subtotal en /cart y en el sidebar

El subtotal del sidebar en `/cart` se calcula server-side con los datos iniciales. Después de `router.refresh()`, Next.js re-calcula. El subtotal del CartDrawer se calcula client-side desde el contexto — siempre refleja el estado más reciente del context.

### Pendiente conocido (fuera de scope HAG-15)

- La actualización optimista del total en la página `/cart` no ocurre hasta el `router.refresh()` — hay un lag visual. Para MVP es aceptable.
- No hay delete masivo ("Clear cart") — fuera de scope MVP.
