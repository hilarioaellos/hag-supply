# Re-auditoría — HAG-92 confirmOrder + HAG-93 Checkout (v2)

Fecha: 2026-10-14
Veredicto anterior (v1): **NO-GO**, con 1 bloqueante y 2 mayores. `confirmOrder` coincide con el plan. Fueron aceptados: los desvíos 1 a 3, los emails como logs hasta HAG-103 y el 200 del admin ante oversell, siempre que comunique el resultado del reembolso.
Documento base: `AUDITORIA-HAG-Supply-HAG92-HAG93.md`. El alcance y la propuesta de despliegue (commit tras el GO, push junto con HAG-94) no cambian.
Estado: **pendiente de veredicto**

---

## 1. BLOQUEANTE — Pago devuelto para una orden cancelada → RESUELTO

`lib/checkout.ts`:

- **Creación en curso vs. abandonada** (`PAYMENT_INTENT_CREATION_GRACE_MS`, línea 68).
  - Una orden `PENDING_PAYMENT` sin PaymentIntent y con menos de 2 minutos de antigüedad puede pertenecer a otra solicitud que todavía espera a Stripe. El SDK corta a los 80 s. En ese caso se responde **409 sin tocar la orden**.
  - Si tiene más de 2 minutos se considera abandonada (caso C).
- **Las escrituras quedan condicionadas entre sí**, así que solo una de las dos solicitudes puede ganar:
  - *Asociar el PaymentIntent* (línea 178): `updateMany({ where: { id, status: PENDING_PAYMENT, stripePaymentIntentId: null } })`. Si `count !== 1`, la orden fue cancelada mientras se esperaba a Stripe. Entonces se **cancela ese PaymentIntent en Stripe** y se responde 409. El `clientSecret` **nunca** se devuelve. El `clientSecret` solo se arma después de que la asociación tuvo éxito.
  - *Cancelar una orden abandonada sin PaymentIntent*: `updateMany({ where: { …, stripePaymentIntentId: null } })`. Si otra solicitud asoció el PaymentIntent entre la lectura y la escritura, `count = 0`.
  - `resolvePendingOrder` (línea 204) **relee la orden** en cada vuelta (hasta 3) y la reevalúa con el PaymentIntent ya asociado (caso B).
  - Si Stripe falla al crear, la cancelación también exige `stripePaymentIntentId: null`.
- Caso residual documentado: el proceso A muere entre `paymentIntents.create` y la asociación. El PaymentIntent queda huérfano en `requires_payment_method`, sin que su `clientSecret` se haya entregado a nadie, así que no se puede pagar. La orden queda abandonada y se cancela en el siguiente checkout después de 2 minutos.

**Validación pedida → hecha.** A se pausa *dentro* de `paymentIntents.create`, con el PaymentIntent ya creado en Stripe test, mediante un cliente envuelto. Mientras tanto se ejecuta B:

| Prueba | Resultado |
|---|---|
| B mientras A está pausada (orden reciente) | B recibe **409** y la orden de A sigue `PENDING_PAYMENT`. Al liberar A, A devuelve el pago y su orden tiene ese PaymentIntent. |
| B mientras A está pausada y la orden de A ya cuenta como abandonada (`createdAt` −5 min) | B cancela la orden de A y crea la suya (pago OK). Al liberar A: **A devuelve 409, no `payment`**. La orden de A queda `CANCELLED` sin PaymentIntent y **el PaymentIntent de A queda `canceled` en Stripe**. El `clientSecret` de B corresponde al PaymentIntent de su orden `PENDING_PAYMENT`. |

## 2. MAYOR — Reembolso pendiente marcado como completado → RESUELTO

`lib/oversell.ts` (reescrito). La orden solo pasa a `CANCELLED_REFUNDED` cuando Stripe informa **`succeeded`**:

| Estado del refund en Stripe | Resultado | Estado de la orden |
|---|---|---|
| `succeeded` | `CANCELLED_REFUNDED` | `CANCELLED_REFUNDED` |
| `pending` | `REFUND_PENDING` | `OVERSELL_REFUND_PENDING` con `stripeRefundId` guardado |
| `requires_action` | `REFUND_PENDING` + aviso al admin | `OVERSELL_REFUND_PENDING` con `stripeRefundId` |
| `failed` / `canceled` | `OVERSELL_REFUND_FAILED` + aviso al admin, con `failure_reason` | `OVERSELL_REFUND_FAILED` |
| Excepción de red o de Stripe | `REFUND_PENDING` (no es un fallo real; el reintento no duplica gracias a la idempotencyKey) | `OVERSELL_REFUND_PENDING` |

- Si existe `stripeRefundId`, se hace **`refunds.retrieve`** para conocer el estado actual; tener el ID no prueba que el refund haya concluido. Si no existe, se busca por `metadata.orderId` y después se crea.
- El ID se guarda apenas existe, sin cerrar la orden.
- Reconciliación posterior: cada nueva llamada a `handleOversell` sobre una orden `OVERSELL_REFUND_PENDING` retoma desde el `stripeRefundId`. En HAG-95 la invocarán el webhook (paso 5 del plan) y los eventos de refund.
- El `confirm-payment` del admin ahora responde `{ success, result, refund, status }`, con el resultado del reembolso y el estado real de la orden. Ante `already_processed` responde `{ success, result, status }`.

**Validación pedida → hecha** (cliente de Stripe con respuestas de refund simuladas, porque esos estados no se producen a demanda en modo test):
- `pending` → pendiente con ID; después `succeeded` por `retrieve` → `CANCELLED_REFUNDED`, **sin un segundo `create`** (recuperación con el `stripeRefundId` guardado).
- `requires_action` → pendiente, no se da por reembolsado.
- `failed` y `canceled` → `OVERSELL_REFUND_FAILED`.
- `stripeRefundId` guardado + `failed` en Stripe → `OVERSELL_REFUND_FAILED`, porque se consulta en lugar de asumir.
- Error transitorio al crear → sigue `OVERSELL_REFUND_PENDING` sin ID.
- El camino `succeeded` con Stripe test real ya estaba cubierto: oversell → 1 refund real → `CANCELLED_REFUNDED`, y la recuperación tras una caída reutiliza el refund existente.

## 3. MAYOR — `already_processed` interpretado como compra confirmada → RESUELTO

`outcomeForStatus` (línea 277) **relee el estado** después de `already_processed`, y también cuando una cancelación condicionada no aplicó:

| Estado releído | Respuesta del checkout |
|---|---|
| `PAYMENT_CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED` | `paid` → `/order-confirmation/[id]` |
| `OVERSELL_REFUND_PENDING`, `CANCELLED_REFUNDED` | 409 "…your payment is being refunded." |
| `OVERSELL_REFUND_FAILED` | 409 "…We couldn't refund your payment automatically; our team has been notified…" |
| `CANCELLED` con el pago cobrado | 409 de revisión manual + `console.error`. No se crea otra orden. |
| `CANCELLED` sin cobro (cancelación condicionada que perdió) | Se permite crear una orden nueva. |
| `PENDING_PAYMENT` | 409 "try again in a moment" |

**Validación:** un cliente cuyo `paymentIntents.retrieve` devuelve `succeeded` y, en el mismo momento, otro actor cambia la orden. Ese estado nuevo se ve después del `findFirst` inicial y antes de `confirmOrder`, que entonces devuelve `already_processed`:
- `OVERSELL_REFUND_PENDING`, `CANCELLED_REFUNDED` y `OVERSELL_REFUND_FAILED` → 409 de reembolso, **nunca `paid`**.
- `CANCELLED` → 409 de revisión, sin orden nueva.
- `PAYMENT_CONFIRMED` → `paid`.

---

## Evidencia general

- `scripts/test-checkout.ts` → **28/28 OK**: las 15 originales, más "caso C reciente → 409 sin cancelar" y las 12 de esta ronda. Se ejecutó contra PostgreSQL 18 local desechable con el índice parcial y Stripe test real. Las pruebas de carreras y de estados de refund envuelven el cliente de Stripe con un `Proxy`; los métodos no reemplazados siguen llamando a Stripe test.
- Para poder probarlo, `startCheckout(userId, shipping, client = stripe)` y `handleOversell(orderId, client = stripe)` aceptan el cliente de Stripe como parámetro, con el cliente real por defecto. La API route y el admin no lo pasan.
- `tsc --noEmit --incremental false`: OK.
- `next build`: OK.

Seguimiento menor (aceptado en la v1): revisión visual del formulario en móvil y escritorio.

---

## Veredicto v2: GO (modo test) · Ajuste posterior al GO

- **Observación menor resuelta:** en `resolvePendingOrder`, si la orden ya no está `PENDING_PAYMENT` al releerla, ahora se responde según su estado (`outcomeForStatus`, sin cobro registrado). Si el webhook la confirmó y vació el carrito entre ambas lecturas, el cliente recibe `paid` y no "Your cart is empty".
- **Prueba nueva** (29/29 OK): un middleware de Prisma, solo en el script de pruebas, confirma la orden y vacía el carrito justo antes de la relectura → `{ kind: "paid" }`. `tsc` y `next build` OK.
- **Siguen pendientes:** la revisión visual en móvil y escritorio; la reconciliación posterior de refunds, que depende de HAG-95; y el push junto con HAG-94.
