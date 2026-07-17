# HAG Supply — Auditoria HAG-24
**Fecha:** 17 julio 2026
**Scope:** Cuenta usuario con historial de órdenes
**Base aprobada:** `05b0292` (HAG-23 GO)
**Estado working tree:** sin commit (pendiente GO)
**`tsc --noEmit`:** PASS

---

## Qué se construyó

1. **app/(store)/account/page.tsx**
   - Info básica: nombre, email
   - Link a historial de órdenes

2. **app/(store)/account/orders/page.tsx**
   - Tabla de órdenes del usuario (WHERE userId = session.user.id)
   - Columnas: orderNumber, fecha, items (count), total, status (badge con color)
   - Ordenado por fecha desc
   - Link "View Details" → /order-confirmation/[id]
   - Estado vacío con "Start Shopping" CTA

3. **app/(store)/order-confirmation/[id]/page.tsx**
   - Detalle completo de orden: number, fecha, status
   - Items con imagen, nombre, qty, precio unitario, total
   - Dirección de envío
   - Total breakdown
   - Validación: userId === session.user.id, notFound() si no coincide (excepto ADMIN)

---

## Verificaciones

```
tsc --noEmit                              → PASS
/account (sin sesión)                     → redirect /login?redirect=/account
/account (autenticado)                    → info básica + link órdenes
/account/orders (sin sesión)              → redirect /login?redirect=/account/orders
/account/orders (con órdenes)             → tabla órdenes
/account/orders (sin órdenes)             → estado vacío + CTA
/order-confirmation/[id] (dueño)          → renderiza orden
/order-confirmation/[id] (no dueño)       → notFound
/order-confirmation/[id] (admin)          → renderiza orden
```

---

## Archivos nuevos o modificados

- `app/(store)/account/page.tsx` (nuevo) — Info usuario básica
- `app/(store)/account/orders/page.tsx` (nuevo) — Tabla de órdenes del usuario
- `app/(store)/order-confirmation/[id]/page.tsx` (nuevo) — Detalle de orden con validación

---

## Detalles técnicos

### Validación de ownership

En `/order-confirmation/[id]/page.tsx`:
```typescript
if (order.userId !== session.user.id && session.user.role !== "ADMIN") {
  notFound();
}
```

- Dueño de la orden: puede ver
- ADMIN: puede ver
- Otros usuarios: notFound

### Estado vacío

Si no hay órdenes en `/account/orders`:
- Icono 📦
- Mensaje "No Orders Yet"
- CTA "Start Shopping" → /

### Status badges

8 colores diferentes según estado:
- PENDING_PAYMENT: amarillo
- PAYMENT_CONFIRMED: verde
- PROCESSING: azul
- SHIPPED: azul
- DELIVERED: verde
- Otros: gris

---

## Condiciones para GO

HAG-24 puede pasar a `GO` cuando:

1. ✅ /account renderiza nombre, email, link a órdenes
2. ✅ /account/orders lista órdenes del usuario (userId = session.user.id)
3. ✅ /account/orders tabla muestra orderNumber, fecha, items count, total, status
4. ✅ /account/orders estado vacío con CTA
5. ✅ /order-confirmation/[id] renderiza detalle completo
6. ✅ /order-confirmation/[id] valida ownership (notFound si no es dueño ni admin)
7. ✅ Protección: requiere sesión en /account y /account/orders
8. ✅ `tsc --noEmit` PASS
