# HAG Supply — Auditoria HAG-24 (v2 — re-auditoria post NO GO)
**Fecha:** 17 julio 2026
**Scope:** Cuenta usuario — fixes aplicados
**Base aprobada:** `c508d2d` (HAG-24 inicial)
**Veredicto anterior:** NO GO (1 hallazgo mayor + 1 sugerencia)
**`tsc --noEmit`:** PASS

---

## Veredicto

Los hallazgos están resueltos:

1. ✅ **Mayor**: Dos versiones de `/account` → Eliminar `app/account/page.tsx` antigua
2. ✅ **Sugerencia**: `/order-confirmation/[id]` → Redirigir a login sin sesión (consistencia)

Con eso, HAG-24 pasa a `GO`.

---

## Hallazgos del NO GO y como se resolvieron

| Hallazgo | FIX verificado |
|---|---|
| Mayor: Dos rutas /account conflictivas | ✅ Eliminar app/account/page.tsx antigua |
| Sugerencia: Inconsistencia en redirect sin sesión | ✅ /order-confirmation/[id] redirige a login |

---

## Verificaciones finales

```text
tsc --noEmit                                    → PASS
/account (sin sesión)                          → redirect /login?redirect=/account
/account (autenticado)                         → info básica + link órdenes
/account/orders (sin sesión)                   → redirect /login?redirect=/account/orders
/account/orders (con órdenes)                  → tabla órdenes
/order-confirmation/[id] (sin sesión)          → redirect /login?redirect=/order-confirmation/[id]
/order-confirmation/[id] (dueño)               → renderiza orden
/order-confirmation/[id] (no dueño)            → notFound
/order-confirmation/[id] (admin)               → renderiza orden
Ruta duplicada /account                        → solo app/(store)/account/page.tsx existe
```

---

## Cambios específicos

### app/account/page.tsx (eliminado)

- ✅ Remover versión antigua para evitar conflicto de rutas

### app/(store)/order-confirmation/[id]/page.tsx (corregido)

- ✅ Cambiar: `notFound()` → `redirect(/login?redirect=...)`
- ✅ Consistencia: mismo patrón que /account y /account/orders

---

## Commits

- `b77f7f8 fix: HAG-24 — Remove duplicate old app/account/page.tsx`
- `496cec1 fix: HAG-24 — /order-confirmation redirect to login without session`

---

## Notas finales

### Ruta única /account

Ahora solo existe `app/(store)/account/page.tsx`. Next.js App Router sirve esta ruta sin ambigüedad.

### Protección consistente

Las tres rutas de usuario siguen el mismo patrón:
- Sin sesión → `redirect("/login?redirect=...")`
- Con sesión + ownership/role check → renderiza o notFound()

Esto mantiene coherencia en el flujo de autenticación.
