# HAG Supply - Auditoria HAG-14
**Fecha:** 16 julio 2026
**Scope:** AddToCartButton + API del carrito
**Base aprobada:** `88ef512` (HAG-13 docs)
**Estado working tree:** sin commit (pendiente GO)
**Veredicto:** NO GO
**`tsc --noEmit`:** PASS

---

## Hallazgos

### Mayor 1 - `AddToCartButton` usa `useSession()` sin `SessionProvider`

El boton depende de `useSession()` de `next-auth/react`, pero en el arbol actual no hay ningun `SessionProvider` envolviendo la app ni el store layout.

Eso convierte el flujo principal entregado en un blocker de runtime:
- el componente no puede depender de `status === "unauthenticated"` si `useSession()` no tiene provider
- el comportamiento documentado "sin sesion redirige a login" no queda garantizado
- el punto de integracion del CTA de producto queda funcionalmente incompleto

**Referencias:**
- [components/product/AddToCartButton.tsx](C:/Users/haell/Documents/VibeCoding-Projects/hag-supply/components/product/AddToCartButton.tsx:15)
- [app/layout.tsx](C:/Users/haell/Documents/VibeCoding-Projects/hag-supply/app/layout.tsx:9)
- [app/(store)/layout.tsx](C:/Users/haell/Documents/VibeCoding-Projects/hag-supply/app/(store)/layout.tsx:7)
- [app/(store)/product/[slug]/QuantitySelector.tsx](C:/Users/haell/Documents/VibeCoding-Projects/hag-supply/app/(store)/product/[slug]/QuantitySelector.tsx:41)

```tsx
const { data: session, status } = useSession();
```

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-hag-bg">{children}</body>
    </html>
  );
}
```

```tsx
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <Header />
      <CategoryNav />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </CartProvider>
  );
}
```

**Estado:** NO resuelto

---

### Medio 1 - `PATCH /api/cart` puede devolver `500` si el item no existe

La ruta `PATCH` valida producto y stock, pero luego ejecuta `db.cartItem.update()` sobre la key compuesta sin manejar el caso en que el cart item no exista para ese usuario.

En ese escenario Prisma lanzaria error y la API responderia `500`, cuando el contrato esperado deberia ser un error controlado (`404` o `400`).

**Referencia:** [app/api/cart/route.ts](C:/Users/haell/Documents/VibeCoding-Projects/hag-supply/app/api/cart/route.ts:105)

```ts
const item = await db.cartItem.update({
  where: { userId_productId: { userId, productId } },
  data: { quantity },
});
```

**Estado:** NO resuelto

---

## Verificaciones ejecutadas

```text
tsc --noEmit                                        -> PASS
GET  /api/cart   (sin sesion)                       -> 401
POST /api/cart   (sin sesion)                       -> 401
DELETE /api/cart?productId=x (sin sesion)           -> 401
```

Verificaciones que faltan para cerrar `GO`:
- render real de `AddToCartButton` en pagina de producto con provider de sesion presente
- redirect a `/login?redirect=...` para usuario sin sesion
- POST exitoso al carrito con sesion valida
- drawer abierto tras agregar item
- PATCH contra item inexistente con respuesta controlada

---

## Cobertura del alcance entregado

### Confirmado en codigo

- `GET /api/cart` devuelve items del usuario autenticado con `product` incluido y `orderBy: { addedAt: "asc" }`
- `POST /api/cart` usa `upsert` y valida `quantity > stock` con `400`
- `PATCH /api/cart` valida stock con la misma regla
- `DELETE /api/cart?productId=x` usa `deleteMany`, por lo que es idempotente
- `AddToCartButton` intenta:
  - redirigir a login sin sesion
  - llamar `POST /api/cart` con sesion
  - mostrar estados `loading`, `added` y `error`
  - refrescar carrito y abrir drawer al agregar

### No confirmado como funcional end-to-end

- el comportamiento de `AddToCartButton` depende de `useSession()` pero no hay `SessionProvider` en el layout actual
- por tanto, el feature principal del CTA no queda validado como operativo

---

## Notas

### Sobre `GET /api/cart`

La implementacion incluye `deletedAt` en el `select` del producto, aunque el `CartProvider` no lo usa. No es un bug por si mismo, solo dato extra en la respuesta.

### Sobre `POST /api/cart`

El `upsert` hace replace de `quantity`, no acumulacion. Si el usuario ya tenia una cantidad y vuelve a agregar el mismo producto desde PDP, queda con la nueva cantidad enviada.

### Sobre `DELETE /api/cart`

El uso de `deleteMany` esta bien para el contrato descrito. Si el item no existe, no falla.

---

## Condiciones para GO

HAG-14 puede pasar a `GO` cuando:

1. El arbol cliente que renderiza `AddToCartButton` quede envuelto en `SessionProvider` o se elimine la dependencia de `useSession()`.
2. `PATCH /api/cart` maneje el caso de item inexistente con respuesta controlada en vez de error no capturado.
3. Se verifique el flujo end-to-end de agregar al carrito y apertura del drawer con sesion valida.
