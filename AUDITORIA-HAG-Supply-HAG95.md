# Solicitud de auditoría — HAG-95 Webhook de Stripe

Fecha: 2026-10-15
Stack: Next.js 16.2.10 + Prisma 5.22 + Stripe (stripe-node 22.3.1, API 2026-06-24.dahlia, **modo test**) · Hosting: Vercel
Ticket: [HAG-95](https://linear.app/hag-projects/issue/HAG-95)
Base: `4df84bf` (checkout HAG-92/93/94 en producción, modo test)
Plan de referencia: `HAG-Supply-MVP-Plan.md`, sección D
Diff para revisar: `AUDITORIA-HAG-Supply-HAG95-cambios.diff`
Estado: **pendiente de veredicto**

---

## Objetivo

Confirmar las órdenes aunque el comprador **no vuelva** a `/order-confirmation`. Esta era la condición del auditor para habilitar cobros reales. También concluir por evento los reembolsos que quedaron `OVERSELL_REFUND_PENDING`, que era la dependencia abierta de HAG-94.

## Cambios a auditar

| Archivo | Tipo | Resumen |
|---|---|---|
| `app/api/webhooks/stripe/route.ts` | nuevo | `POST`, sin sesión: la autenticidad la da la firma. Sin `STRIPE_WEBHOOK_SECRET` → **500**, para que Stripe siga reintentando hasta que se configure. Sin header `stripe-signature` → 400. Lee `req.text()` (cuerpo crudo, sin parsear) y llama a `stripe.webhooks.constructEvent`; si la firma no es válida → 400. Después llama a `handleStripeEvent`: si termina bien → 200 `{ received: true }`, si lanza → **500** (Stripe reintenta). Registra en el log `tipo id → acción`. `proxy.ts` no cubre `/api/webhooks`. |
| `lib/stripe-webhook.ts` | nuevo | `handleStripeEvent(event, client = stripe)`. Detalle abajo. |
| `lib/oversell.ts` | modificado | Nuevo resultado **`REFUND_ERROR`** (error transitorio al consultar o crear el refund), separado de `REFUND_PENDING` (refund `pending`/`requires_action`). Así el webhook puede pedir reintento sin confundirlo con un refund que sigue pendiente. La orden queda `OVERSELL_REFUND_PENDING` en ambos casos. Los demás llamadores (checkout, reconcile, admin) no cambian de comportamiento. |
| `scripts/test-checkout.ts` | modificado | 8 pruebas de webhook; la de error transitorio de `handleOversell` ahora espera `REFUND_ERROR`. |

### `handleStripeEvent`

**`payment_intent.succeeded`** (sección D, pasos 3 a 7):
- Busca la orden por `stripePaymentIntentId`.
- Estados terminales (`PAYMENT_CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `CANCELLED_REFUNDED`, `OVERSELL_REFUND_FAILED`) → `skipped`, 200.
- `OVERSELL_REFUND_PENDING` → flujo de oversell.
- `PENDING_PAYMENT` → `confirmOrder`:
  - `confirmed` → email (log hasta HAG-103).
  - `already_processed` → 200.
  - `oversell` → `handleOversell`.
  - Una excepción de base de datos se propaga y la ruta responde 5xx.
- Flujo de oversell: si `handleOversell` devuelve `REFUND_ERROR`, **se lanza** y la ruta responde 5xx, así que Stripe reenvía el evento. El refund tiene `idempotencyKey` y búsqueda por `metadata.orderId`, por lo que no se duplica.
- **Pago sin orden asociada** (`orphan_payment`): se registra en el log y se avisa al admin. Responde 200 para no entrar en un bucle de reintentos y **no** se reembolsa a ciegas. No debería ocurrir, porque el checkout solo entrega el `clientSecret` de PaymentIntents ya asociados (HAG-93 v2).

**`refund.updated` y `refund.failed`:**
- Busca la orden por `stripeRefundId` o por `metadata.orderId`. Si no hay orden (un refund hecho a mano en el panel de Stripe) → se ignora con 200.
- `OVERSELL_REFUND_PENDING` → `handleOversell`, que vuelve a consultar el refund por su ID y solo cierra la orden si es `succeeded`.
- **Desvío del plan:** `CANCELLED_REFUNDED` + refund `failed`/`canceled` con el mismo `stripeRefundId` → **`OVERSELL_REFUND_FAILED`** + aviso al admin. El cambio de estado está condicionado al estado y al ID. Stripe documenta reembolsos que salen `succeeded` y después fallan (tarjeta de prueba `4000 0000 0000 0005` / `pm_card_refundFail`). Sin esta regla, la orden figuraría "reembolsada" aunque el dinero no volvió al cliente. El plan marcaba `CANCELLED_REFUNDED` como "terminal absoluto"; esta es la única salida, y solo hacia el estado que pide atención manual.

**Cualquier otro tipo** → `ignored:<tipo>`, 200.

## Evidencia

### `scripts/test-checkout.ts` → **45/45 OK**

Son las 37 anteriores más 8 nuevas de HAG-95. Corren contra PostgreSQL 18 local desechable y Stripe test real. Los eventos se firman con `stripe.webhooks.generateTestHeaderString`, y las pruebas de firma llaman a la **ruta real** (`POST`) con un `Request`.

| Prueba | Resultado |
|---|---|
| Firma | Sin header → 400; `t=1,v1=deadbeef` → 400; firmado **con otro secreto** → 400; sin `STRIPE_WEBHOOK_SECRET` → 500; firma válida → 200 `{ received: true }`. |
| `payment_intent.succeeded` con pago real (`pm_card_visa`) | `PAYMENT_CONFIRMED`, stock 5 → 4, carrito vacío. **El evento duplicado** devuelve 200, `skipped:PAYMENT_CONFIRMED` y el stock sigue en 4. |
| Pago real sin stock | **Refund real con `metadata.orderId` y `orderNumber`** → `CANCELLED_REFUNDED`. El reenvío no duplica (1 refund). |
| Error transitorio al crear el refund | `handleStripeEvent` lanza (la ruta respondería 5xx) y la orden queda `OVERSELL_REFUND_PENDING`. El reenvío por la ruta con Stripe real → `CANCELLED_REFUNDED` con 1 refund. |
| `refund.updated` con refund **`pending` real** (`pm_card_pendingRefund` / 7726) | Sigue `OVERSELL_REFUND_PENDING`. Cuando llega `succeeded` (con `retrieve` simulado igual que el evento) → `CANCELLED_REFUNDED` sin otro refund. |
| `refund.failed` después de `CANCELLED_REFUNDED` | → `OVERSELL_REFUND_FAILED`. Si se repite → `skipped`, sin cambios. |
| Estado terminal `CANCELLED` + `payment_intent.succeeded` | `skipped:CANCELLED`, la orden no cambia. |
| Pago sin orden | 200 y `orphan_payment`. |
| Refund ajeno sin orden / `charge.succeeded` | Se ignoran con 200. |

### Prueba HTTP con `next start` (runtime real de Next, base de pruebas, secreto de prueba)

- Evento firmado → **200** `{"received":true}`.
- **Mismo evento con el cuerpo alterado** → **400** `Invalid signature`. Esto confirma que la firma se calcula sobre el cuerpo crudo que llega a la ruta.
- Sin firma → 400 `Missing signature`.

### Estático
- `tsc --noEmit --incremental false`: OK.
- `next build`: OK (`ƒ /api/webhooks/stripe`).

## Fuera de alcance

- **Email real (Resend)** de confirmación y de aviso al admin: es HAG-103. Hoy `lib/order-emails.ts` solo escribe en el log. El auditor lo aceptó para modo test.
- **Avisos de refunds pendientes por mucho tiempo:** no hay un aviso automático. Se ven en /admin, con la etiqueta "Refund Pending".

## Despliegue (después del GO)

1. Commit y push de HAG-95. Sin `STRIPE_WEBHOOK_SECRET`, la ruta responde 500 y Stripe reintenta; el resto de la tienda no se ve afectado.
2. **Crear el endpoint en Stripe (modo test)**, a cargo del usuario o con su autorización expresa:
   - URL: `https://supply.hagpartner.com/api/webhooks/stripe`
   - Eventos: `payment_intent.succeeded`, `refund.updated`, `refund.failed`.
3. **Usuario:** copiar el *Signing secret* (`whsec_…`) a Vercel como `STRIPE_WEBHOOK_SECRET` (Secret, Production) y hacer **Redeploy**, porque las variables se leen en el deploy.
4. **Verificación en vivo:** compra de prueba con la tarjeta 4242 **sin volver** a la página de confirmación (por ejemplo, cerrando la pestaña durante la redirección). La orden debe quedar `PAYMENT_CONFIRMED` solo por el webhook. Además, el panel de Stripe → Webhooks debe mostrar entregas 200. Después, limpieza (refund de prueba y devolución del stock), igual que en HAG-94.
5. Cerrar HAG-102, que esperaba `STRIPE_WEBHOOK_SECRET`.

## Puntos a revisar por el auditor

1. El desvío `CANCELLED_REFUNDED → OVERSELL_REFUND_FAILED` cuando el refund falla después de completarse.
2. `orphan_payment` responde 200 con aviso, sin reembolsar automáticamente.
3. Que falte el secreto → 500 (Stripe reintenta durante días) en lugar de 400.
4. Después de este GO, ¿quedan condiciones para habilitar cobros reales además de HAG-103 y de activar la cuenta de Stripe con claves live?
