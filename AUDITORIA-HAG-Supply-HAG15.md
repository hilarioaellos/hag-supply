# HAG Supply - Auditoria HAG-15
**Fecha:** 17 julio 2026
**Scope:** CartDrawer completo + CartItem + pagina `/cart`
**Base aprobada:** `02e4a16` (HAG-14)
**Estado working tree:** sin commit (pendiente auditor)
**Veredicto anterior:** NO GO (2 hallazgos)
**`tsc --noEmit`:** PASS

---

## Hallazgos

### Mayor 1 - `CartItem` deja la UI desincronizada si `PATCH /api/cart` falla

`CartItem` actualiza `qty` de forma optimista antes de conocer el resultado del `PATCH`, pero no verifica `res.ok` ni revierte el estado si la API responde `400` o `404`.

Eso rompe el contrato visual del carrito en escenarios reales:
- si el stock baja entre render y click, `PATCH` responde `400`, pero el item puede seguir mostrando la nueva cantidad local
- si el item ya no existe, `PATCH` responde `404`, pero el componente no maneja el error
- el problema es mas grave porque `qty` vive en `useState` local y no se resincroniza con `item.quantity` al refrescar datos

**Referencia original:** [components/cart/CartItem.tsx:35](C:/Users/haell/Documents/VibeCoding-Projects/hag-supply/components/cart/CartItem.tsx:35)

```tsx
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
```

**FIX APLICADO:**

```tsx
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
```

- Captura `prevQty` antes del cambio optimista
- Valida `res.ok` antes de refrescar
- Revierte `setQty(prevQty)` si PATCH falla (400, 404, etc.)
- Return sin ejecutar `refresh()` ni `onMutate()` mantiene la UI consistente

**Estado:** RESUELTO

---

### Medio 1 - El checkout del drawer puede mandar a login por error mientras la sesion esta en `loading`

`CartDrawer` decide `checkoutHref` solo con `status === "authenticated"`. Cualquier otro estado, incluido `loading`, manda al usuario a `/login?redirect=/checkout`.

Eso crea un edge case de navegación incorrecta:
- usuario autenticado
- drawer abierto antes de que `useSession()` resuelva
- click rápido en "Proceed to Checkout"
- redirección espuria a login

**Referencia original:** [components/cart/CartDrawer.tsx:29-30](C:/Users/haell/Documents/VibeCoding-Projects/hag-supply/components/cart/CartDrawer.tsx:29)

```tsx
const checkoutHref =
  status === "authenticated" ? "/checkout" : "/login?redirect=/checkout";

// En el render:
<Link href={checkoutHref} onClick={closeDrawer} className="block">
  <Button className="w-full">Proceed to Checkout</Button>
</Link>
```

**FIX APLICADO:**

Cambió de Link estático a Button con onClick handler dinámico:

```tsx
const handleCheckoutClick = () => {
  if (status === "authenticated") {
    router.push("/checkout");
  } else if (status === "unauthenticated") {
    router.push("/login?redirect=/checkout");
  }
};

// En el render:
<Button
  className="w-full"
  disabled={status !== "authenticated"}
  onClick={() => {
    closeDrawer();
    handleCheckoutClick();
  }}
>
  Proceed to Checkout
</Button>
```

- Botón **disabled** mientras `status !== "authenticated"` (incluye `loading` y `unauthenticated`)
- Solo se ejecuta navegación si `handleCheckoutClick()` es invocado por click
- Si status === "loading", botón deshabilitado (esperamos a que resuelva)
- Si status === "unauthenticated", click redirige a login
- Si status === "authenticated", click va a checkout

**Estado:** RESUELTO

---

## Verificaciones ejecutadas

```text
tsc --noEmit                        -> PASS
/cart (sin sesion)                  -> 307 -> /login?redirect=/cart
```

Verificaciones faltantes para cerrar `GO`:
- mutacion de cantidad con respuesta `200` y refresco correcto del drawer
- mutacion de cantidad con respuesta `400` por stock insuficiente y feedback correcto
- mutacion de cantidad con respuesta `404` para item inexistente y UI consistente
- checkout desde drawer con sesion autenticada durante hidratacion

---

## Cobertura del alcance entregado

### Confirmado en codigo

- `components/cart/CartItem.tsx` existe con imagen, nombre, selector de cantidad via `PATCH` y boton `Remove` via `DELETE`
- `components/cart/CartDrawer.tsx` integra `CartItem`, subtotal, CTA a checkout y link a `/cart`
- `app/(store)/cart/page.tsx` existe y protege `/cart` con redirect a login si no hay sesion
- `app/(store)/cart/CartPageClient.tsx` pasa `router.refresh()` como `onMutate`

### No validado como correcto en runtime

- manejo de errores de `PATCH` dentro de `CartItem`
- navegación correcta a checkout desde drawer mientras `useSession()` sigue cargando

---

## Notas

### Sobre el patron doble refresh

El diseño `refresh()` del `CartProvider` + `router.refresh()` en `/cart` es razonable para MVP y mantiene sincronizados badge, drawer y sidebar cuando la mutacion sale bien.

### Sobre `DELETE`

`removeItem()` tampoco valida `res.ok`, pero el impacto visible es menor que en `PATCH` porque el estado local no queda alterado de forma irreversible como sí pasa con `qty`.

---

## Correcciones Aplicadas (17 julio)

### Mayor 1 — CartItem PATCH validation
✅ Implementado: `res.ok` check + `setQty(prevQty)` revert si falla

### Medio 1 — CartDrawer checkout durante loading
⚠️ Primer intento bloqueó también a `unauthenticated` (regresión)
✅ Corregido: `disabled={status === "loading"}` permite click a usuarios sin sesión

### Sugerencia — removeItem() validation
✅ Alineado con updateQty: ahora valida `res.ok` antes de refresh

**Estado actual:** Código compilable, hallazgos abordados. Pendiente re-auditoría.
