# HAG Supply - Auditoria HAG-14 (v2 - re-auditoria post NO GO)
**Fecha:** 16 julio 2026
**Scope:** AddToCartButton + API del carrito - diff completo desde `88ef512`
**Estado working tree:** sin commit (pendiente GO)
**Veredicto:** GO
**`tsc --noEmit`:** PASS

---

## Veredicto

Los dos hallazgos que bloqueaban HAG-14 en la auditoria anterior estan resueltos en el codigo actual:

- `AddToCartButton` ya tiene `SessionProvider` en el arbol via `SessionProviderWrapper` en `app/layout.tsx`
- `PATCH /api/cart` ya devuelve `404` controlado cuando el item no existe

Con eso, HAG-14 pasa a `GO` para el alcance auditado. Los pendientes restantes pertenecen al trabajo posterior del drawer y checkout, no bloquean este entregable.

---

## Hallazgos del NO GO y como se resolvieron

| # | Hallazgo | Fix verificado |
|---|---|---|
| Mayor 1 | `useSession()` sin `SessionProvider` en el arbol | `SessionProviderWrapper` agregado al root layout |
| Medio 1 | `PATCH /api/cart` podia terminar en `500` si el item no existia | `findUnique` previo al `update` -> `404 "Item not in cart."` |

---

## Verificaciones

```text
tsc --noEmit                                              -> PASS
GET  /api/cart   (sin sesion)                             -> 401
POST /api/cart   (sin sesion)                             -> 401
DELETE /api/cart?productId=x  (sin sesion)                -> 401
Click "Add to Cart" sin sesion en /product/chefs-knife... -> redirect a /login?redirect=%2Fproduct%2Fchefs-knife-8-inch-professional
```

Estas verificaciones son consistentes con el estado actual del codigo:
- `SessionProviderWrapper` existe y envuelve `children` en el root layout
- `AddToCartButton` sigue usando `useSession()` y ahora ya tiene provider valido
- `PATCH /api/cart` hace `findUnique` previo y devuelve `404 "Item not in cart."`

---

## Archivos relevantes

### components/auth/SessionProviderWrapper.tsx (nuevo)

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

### app/layout.tsx (modificado - anadido SessionProviderWrapper)

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { SessionProviderWrapper } from "@/components/auth/SessionProviderWrapper";

export const metadata: Metadata = {
  title: { default: "HAG Supply", template: "%s | HAG Supply" },
  description: "Everything for your home - pantry, cleaning, decor, tools and garden.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-hag-bg">
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
```

### app/api/cart/route.ts (PATCH corregido)

```ts
export const PATCH = withAuth(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const body = await req.json();
  const { productId, quantity } = body ?? {};

  if (!productId || typeof quantity !== "number" || quantity < 1) {
    return NextResponse.json({ error: "productId and quantity >= 1 required." }, { status: 400 });
  }

  const product = await db.product.findUnique({
    where: { id: productId, deletedAt: null },
    select: { stock: true },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  if (quantity > product.stock) {
    return NextResponse.json(
      { error: `Only ${product.stock} unit${product.stock === 1 ? "" : "s"} available.` },
      { status: 400 }
    );
  }

  const existing = await db.cartItem.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Item not in cart." }, { status: 404 });
  }

  const item = await db.cartItem.update({
    where: { userId_productId: { userId, productId } },
    data: { quantity },
  });

  return NextResponse.json({ id: item.id, quantity: item.quantity });
});
```

### components/product/AddToCartButton.tsx (sin cambios funcionales respecto a v1)

```tsx
export function AddToCartButton({ productId, stock, quantity }: Props) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { refresh, openDrawer } = useCart();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<"idle" | "added" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleClick() {
    if (status === "unauthenticated") {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    // POST /api/cart ...
    // refresh()
    // openDrawer()
  }
}
```

---

## Notas

### Sobre el SessionProvider

El fix correcto era envolver la app cliente con `SessionProvider` sin convertir el root layout completo en Client Component. El wrapper fino resuelve eso de forma estandar.

### Sobre PATCH

La validacion nueva elimina el `500` por item inexistente y deja el contrato de la API mas consistente con el resto del recurso.

### Pendientes no bloqueantes

- CartDrawer todavia no tiene acciones de eliminar/cambiar cantidad - HAG-15
- La pagina standalone `/cart` queda para HAG-15
- La validacion final de oversell pertenece a checkout - HAG-16/17/19
