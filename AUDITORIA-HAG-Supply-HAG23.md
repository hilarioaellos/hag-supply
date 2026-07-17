# HAG Supply — Auditoria HAG-23
**Fecha:** 17 julio 2026
**Scope:** Admin gestión de órdenes (status transitions + confirm-payment)
**Base aprobada:** `e8804da` (HAG-22 GO)
**Estado working tree:** sin commit (pendiente GO)
**`tsc --noEmit`:** PASS

---

## Qué se construyó

1. **lib/confirm-order.ts** — Función compartida (checkout + webhook + admin)
   - Transacción atómica con 4 pasos: status→PAYMENT_CONFIRMED, cargar items, decrementar stock, vaciar carrito
   - Manejo de errores: ALREADY_PROCESSED, OVERSELL
   - Retorna: `"confirmed" | "already_processed" | "oversell"`

2. **API routes**
   - PATCH `/api/admin/orders/[id]/status` — cambiar status con validación de transiciones
   - POST `/api/admin/orders/[id]/confirm-payment` — confirmar pago manualmente desde Stripe

3. **UI**
   - `/admin/orders/[id]/page.tsx` (actualizado) — dropdown status + botón confirm-payment + link Stripe
   - OrderStatusSelect: dropdown con transiciones permitidas por estado
   - ConfirmPaymentButton: confirmar pago (verificar Stripe + llamar confirmOrder)

---

## Verificaciones

```
tsc --noEmit                                    → PASS
lib/confirm-order.ts transacción atómica       → 4 pasos, rollback si oversell
PATCH /api/admin/orders/[id]/status            → transiciones permitidas
POST /api/admin/orders/[id]/confirm-payment    → verifica PENDING_PAYMENT, Stripe, confirmOrder
/admin/orders/[id] dropdown status             → visible, solo transiciones permitidas
Confirm Payment button                         → visible solo si PENDING_PAYMENT + stripeId
Stripe dashboard link                          → href a dashboard Stripe
```

---

## Archivos nuevos o modificados

### Función compartida

- `lib/confirm-order.ts` — confirmOrder() con transacción atómica

### API Routes

- `app/api/admin/orders/[id]/status/route.ts` — PATCH cambiar status
- `app/api/admin/orders/[id]/confirm-payment/route.ts` — POST confirmar pago manual

### UI Pages

- `app/admin/orders/[id]/page.tsx` (actualizado) — agregar status changes section

### Componentes

- `components/admin/OrderStatusSelect.tsx` — dropdown con transiciones
- `components/admin/ConfirmPaymentButton.tsx` — botón confirm-payment

---

## Detalles técnicos

### Transacciones atómicas (lib/confirm-order.ts)

```typescript
await db.$transaction(async (tx) => {
  // PASO 1: Cambiar status a PAYMENT_CONFIRMED (con where status=PENDING_PAYMENT)
  // Si falla (count=0) → ALREADY_PROCESSED
  
  // PASO 2: Cargar items de la orden
  
  // PASO 3: Decrementar stock por item
  // Si falla (count=0 en cualquier item) → OVERSELL
  
  // PASO 4: Vaciar carrito del usuario
});
```

Si cualquier paso falla, toda la transacción rollbacks. Status revierte a PENDING_PAYMENT.

### Transiciones de estado

```
PENDING_PAYMENT → (confirm-payment manual)
PAYMENT_CONFIRMED → PROCESSING
PROCESSING → SHIPPED
SHIPPED → DELIVERED
DELIVERED → (fin)
```

Otros estados (CANCELLED, OVERSELL_*, etc.) no tienen transiciones permitidas desde admin.

### Confirm Payment Manual

1. Verificar status = PENDING_PAYMENT
2. Verificar stripePaymentIntentId existe
3. Consultar Stripe: paymentIntent.status === "succeeded"
4. Llamar confirmOrder() — función atómica
5. Retornar resultado (confirmed, already_processed, oversell)

---

## Notas

### Función compartida (confirm-order.ts)

Esta función es necesaria para:
- HAG-23: Confirmar pago manual desde admin
- HAG-16: POST /api/checkout caso B (PaymentIntent succeeded)
- HAG-19: Webhook Stripe payment_intent.succeeded

No repetir lógica de transacción en 3 lugares.

### Validación de transiciones

Las transiciones están hardcodeadas en dos lugares:
- `components/admin/OrderStatusSelect.tsx` (UI)
- `app/api/admin/orders/[id]/status/route.ts` (API)

Están sincronizadas, pero si se agregan transiciones nuevas, actualizar en ambos.

### Link a Stripe

`https://dashboard.stripe.com/test/payments/{stripePaymentIntentId}` lleva al dashboard en TEST mode. En producción cambiar a `/live/payments/`.

---

## Condiciones para GO

HAG-23 puede pasar a `GO` cuando:

1. ✅ lib/confirm-order.ts implementa transacción atómica con 4 pasos
2. ✅ PATCH /api/admin/orders/[id]/status valida transiciones permitidas
3. ✅ POST /api/admin/orders/[id]/confirm-payment verifica status, Stripe, confirmOrder
4. ✅ OrderStatusSelect renderiza dropdown con transiciones correctas
5. ✅ ConfirmPaymentButton visible solo si PENDING_PAYMENT + stripeId
6. ✅ Link a Stripe dashboard funciona
7. ✅ Protección: solo ADMIN puede hacer PATCH/POST (withAdmin guard)
8. ✅ `tsc --noEmit` PASS
