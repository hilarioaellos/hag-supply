# Solicitud de auditoría — HAG-92 confirmOrder + HAG-93 Checkout (dirección de envío y POST /api/checkout)

Fecha: 2026-10-14
Stack: Next.js 16.2.10 + Prisma 5.22 + Supabase (PostgreSQL) + Stripe (API 2026-06-24.dahlia, **modo test**) · Hosting: Vercel
Tickets: [HAG-92](https://linear.app/hag-projects/issue/HAG-92) (función compartida) · [HAG-93](https://linear.app/hag-projects/issue/HAG-93) (checkout)
Plan de referencia: `HAG-Supply-MVP-Plan.md`, secciones A, B, C, D (paso 7), F, G y H
Estado: **pendiente de veredicto**

---

## Objetivo

Primera mitad del flujo de compra:
1. El cliente llena su dirección en `/checkout`.
2. El servidor valida el carrito y el stock, calcula el total, crea la orden `PENDING_PAYMENT` y el PaymentIntent en Stripe, y devuelve el `clientSecret`.

El formulario de tarjeta con Stripe Elements es **HAG-94** y queda fuera de este alcance. Hoy el paso de pago muestra "Card payment is not available yet". Por eso **se propone no hacer push** hasta tener también el GO de HAG-94 (ver "Despliegue").

---

## Cambios a auditar

| Archivo | Tipo | Resumen |
|---|---|---|
| `lib/confirm-order.ts` | sin cambios | HAG-92: ya existía (commit 54d1ae0) y coincide con la sección A. Aquí se aportan sus pruebas de aceptación (concurrencia y rollback). |
| `lib/checkout.ts` | nuevo | `validateShipping`, `startCheckout` con los casos A, B, C y D, y `US_STATES`. |
| `lib/oversell.ts` | nuevo | `handleOversell(orderId)`: flujo de la sección D paso 7, compartido con el checkout, el webhook (HAG-95) y el confirm-payment del admin. |
| `lib/order-number.ts` | nuevo | `HAG-YYYYMMDD-XXXXXXXX` con nanoid (36^8). |
| `lib/order-emails.ts` | nuevo | `sendOrderConfirmation` y `notifyAdminRefundFailed`. **Solo registran en el log**; el envío real es HAG-103. Se crean ahora para que los llamadores no cambien después. |
| `app/api/checkout/route.ts` | nuevo | `withAuth`. Valida JSON y dirección (400 con errores por campo) y traduce el resultado a HTTP. |
| `app/(store)/checkout/page.tsx` | nuevo | Componente de servidor: sin sesión redirige al login, con carrito vacío redirige a `/cart`. Muestra el resumen con imagen, subtotal, envío $0.00 y total. |
| `components/checkout/CheckoutForm.tsx`, `ShippingForm.tsx` | nuevos | Formulario de dirección: nombre, línea 1, línea 2 opcional, ciudad, estado (select de 50 estados + DC) y ZIP. Muestra errores por campo y redirige a `/order-confirmation/[id]` si una orden previa ya estaba pagada. |
| `app/api/admin/orders/[id]/confirm-payment/route.ts` | modificado | Completa el TODO de la sección F: `paymentIntents.retrieve` → **422 si no está `succeeded`**. Ante oversell llama a `handleOversell` y responde 200 con `refund`, en lugar del 409 sin reembolso. Llama a `sendOrderConfirmation`. |
| `prisma/migrations/20261015000000_order_one_pending_per_user/` | migración | `CREATE UNIQUE INDEX "one_pending_per_user" ON "Order"("userId") WHERE status = 'PENDING_PAYMENT'` (sección B). **No existe en producción**: lo verifiqué con `pg_indexes`. Producción tiene 0 órdenes. |
| `scripts/test-checkout.ts` | nuevo | Pruebas de integración reproducibles (ver Evidencia). Se niegan a correr si la base no es localhost o si la clave no es `sk_test_`. |

---

## Diseño de `startCheckout` y desvíos respecto del plan

Orden de ejecución:
1. Orden `PENDING_PAYMENT` previa.
2. Carrito no vacío.
3. Stock y productos no ocultos.
4. Total en el servidor (`Prisma.Decimal`; envío $0 e impuestos excluidos).
5. Crear la orden con sus `OrderItem` en un solo `create` anidado.
6. PaymentIntent con `idempotencyKey: pi-{orderId}`, monto en centavos, `usd`, `automatic_payment_methods` y metadata `orderId`/`orderNumber`/`userId`.
7. Devolver el `clientSecret`.

Si Stripe falla, la orden pasa a `CANCELLED` y se responde 500.

Desvíos, todos para reducir riesgo de cobro sin orden:
1. **La orden previa se resuelve antes de validar el carrito** (el plan la ponía en el paso 5). Si esa orden ya se pagó, se reconcilia aunque el carrito o el stock hayan cambiado. Con el orden del plan, un 409 de stock dejaba ese pago sin confirmar hasta que llegara el webhook.
2. **Caso B cancelable: primero se cancela en Stripe y después la orden local** (el plan decía local → Stripe). Si se cancelara primero la orden local, el cliente podría terminar de pagar un PaymentIntent cuya orden ya está `CANCELLED`. Si la cancelación en Stripe falla porque el estado cambió, se vuelve a consultar y se reevalúa (por ejemplo, si pasó a `succeeded` se confirma).
3. **Estados inesperados del PaymentIntent** (no `succeeded`, `processing`, `requires_capture` ni cancelables): 409 sin tocar nada, en lugar de cancelar.
4. **Concurrencia del mismo usuario:** el índice parcial hace que el segundo `create` falle con P2002 (target `userId`) y responda 409. Si la colisión es en `orderNumber`, se reintenta hasta 3 veces.

`handleOversell`:
- `PENDING_PAYMENT → OVERSELL_REFUND_PENDING`.
- Idempotencia: primero `stripeRefundId` local, luego `refunds.list` filtrado por `metadata.orderId`, y recién después `refunds.create` con `idempotencyKey: refund-{orderId}`.
- Éxito → `CANCELLED_REFUNDED`. Refund `failed`/`canceled` o una excepción → `OVERSELL_REFUND_FAILED` + aviso al admin (log hasta HAG-103).
- Todas las transiciones son `updateMany` condicionadas al estado esperado.

---

## Evidencia

### Pruebas de integración: `scripts/test-checkout.ts` → **15/15 OK**

Entorno: PostgreSQL 18 desechable (`initdb` en el scratchpad, puerto 5544) con el esquema actual + el índice parcial, y **Stripe modo test real** (cuenta `acct_1UQY…`, `livemode=false`).

| Ticket | Prueba | Resultado |
|---|---|---|
| HAG-92 | Doble `confirmOrder` concurrente | Un `confirmed` y un `already_processed`; stock 5 → 3 (un solo decremento); carrito vacío. |
| HAG-92 | Stock insuficiente en el 2.º item | `oversell`; orden sigue `PENDING_PAYMENT`; el 1.er item **no** queda decrementado; carrito intacto. |
| HAG-93 | `validateShipping` válida / inválida | Normaliza el estado y `line2` vacía; rechaza nombre, estado y ZIP. |
| HAG-93 | Carrito vacío | 400. |
| HAG-93 | Stock insuficiente / producto oculto | 409 sin crear orden. |
| HAG-93 | **Caso A** | Orden `PENDING_PAYMENT` por $55.48 (2×24.99 + 5.50). PaymentIntent de **5548 centavos** USD con `metadata.orderId`. Stock sin tocar. |
| HAG-93 | **Caso B** sin pagar | PaymentIntent anterior `canceled` en Stripe; orden anterior `CANCELLED`; se crea otra. |
| HAG-93 | **Caso B** pagado (`pm_card_visa`) | `paid` → `PAYMENT_CONFIRMED`, stock 10 → 8, carrito vacío, no se crea otra orden. |
| HAG-93 | **Caso B** pagado sin stock | 409 "…being refunded". Orden `CANCELLED_REFUNDED`, **1 refund** en Stripe con `metadata.orderId`; un segundo `handleOversell` → `SKIPPED` y sigue habiendo 1 refund. |
| HAG-93 | Oversell tras una caída (refund ya creado en Stripe, no guardado localmente) | Reutiliza el refund (sigue habiendo 1) → `CANCELLED_REFUNDED`. |
| HAG-93 | **Caso C** | Orden previa sin PaymentIntent → `CANCELLED`; se crea una nueva. |
| HAG-93 | **Caso D** (`updatedAt` −45 min) | Misma lógica del caso B. |
| HAG-93 | 2 checkouts simultáneos del mismo usuario | Nunca 2 órdenes `PENDING_PAYMENT` (el índice parcial rechaza la segunda). |
| HAG-93 | Stripe rechaza el PaymentIntent (monto $0.10) | Orden `CANCELLED`, sin `stripePaymentIntentId`, 500. |

No probado: el caso B con `processing`/`requires_capture`. En modo test no se puede producir fácilmente con tarjeta; la rama solo responde 409 sin modificar nada.

### Prueba de punta a punta por HTTP (`next start` contra la base de pruebas)

- `POST /api/checkout` sin sesión → 401. `GET /checkout` sin sesión → 307 a `/login?redirect=%2Fcheckout`.
- Login con un usuario de prueba vía NextAuth credentials → sesión OK.
- `GET /checkout` muestra título, "Shipping address", el producto, el total $49.98, el botón "Continue to payment" y el select de estados.
- JSON inválido → 400. Dirección inválida → 400 con `fields` (name, line1, state, zip).
- Dirección válida → 200 `{orderId, orderNumber: HAG-20261014-…, clientSecret, total: "49.98"}`. En la base: `PENDING_PAYMENT`, Miami/FL y `pi_…`.

### Estático
- `tsc --noEmit --incremental false`: OK.
- `next build`: OK (`/checkout` y `/api/checkout` dinámicas).

No verificado: revisión visual en navegador (layout móvil y escritorio) del formulario.

---

## Despliegue (después del GO; propuesta)

1. **Commit después del GO, sin push** hasta el GO de HAG-94. Con solo HAG-93 en producción, los clientes podrían crear órdenes y PaymentIntents pero no pagar.
2. Antes del push conjunto (HAG-93 + HAG-94):
   - a. Cargar en Vercel `STRIPE_SECRET_KEY` y `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (de test). **Obligatorio:** `lib/stripe.ts` lanza un error al importarse sin la clave, y `/checkout` ahora la importa, así que el build de Vercel fallaría sin ella.
   - b. Respaldo (`scripts/backup-db.ts`) → `prisma db execute` del índice `one_pending_per_user` → verificar con `pg_indexes`. La base no tiene `_prisma_migrations`, igual que en HAG-116.

## Puntos a revisar por el auditor

1. Los desvíos 1 a 3 respecto del plan (orden de resolución y orden de cancelación Stripe/local).
2. `lib/order-emails.ts` solo registra en el log hasta HAG-103. ¿Aceptable dejar llamadas que hoy no envían email?
3. `confirm-payment` del admin: ante oversell ahora responde 200 + `refund` (plan, sección F paso 7) en lugar de 409.
4. El precio se toma del producto al crear la orden. Si cambia entre el carrito y el pago, se cobra el precio vigente al iniciar el checkout. El resumen de `/checkout` es solo visual.
