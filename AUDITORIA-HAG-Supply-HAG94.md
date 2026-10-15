# Solicitud de auditoría — HAG-94 Stripe Payment Element y página de confirmación

Fecha: 2026-10-14
Stack: Next.js 16.2.10 + Prisma 5.22 + Stripe (`@stripe/stripe-js` 9.10, API 2026-06-24.dahlia, **modo test**) · Hosting: Vercel
Ticket: [HAG-94](https://linear.app/hag-projects/issue/HAG-94)
Base: commit `bdab016` (HAG-92/93, GO v2, sin push)
Estado: **pendiente de veredicto**

---

## Objetivo

Completar la compra:
1. El cliente paga en `/checkout` con el Payment Element de Stripe. Los datos de la tarjeta nunca pasan por nuestro servidor (PCI).
2. Stripe lo redirige a `/order-confirmation/[id]`.
3. Esa página muestra el **estado real** de la orden.

Mientras no exista el webhook (HAG-95), la página **reconcilia** el pago con Stripe al cargar.

Con el GO se propone hacer **commit y el push conjunto** de HAG-92/93 + HAG-94, previo cumplimiento de los requisitos de "Despliegue".

---

## Cambios a auditar

| Archivo | Tipo | Resumen |
|---|---|---|
| `components/checkout/StripePayment.tsx` | nuevo | Usa `loadStripe` una vez por página, `stripe.elements({ clientSecret })` y `create("payment", { layout: "tabs", defaultValues: { billingDetails: { address: { country: "US" } } } })`. Al pagar llama a `stripe.confirmPayment({ elements, confirmParams: { return_url: <origin>/order-confirmation/<orderId> } })` con la redirección por defecto (siempre redirige en éxito, también después de 3DS). Si no redirige es un error: muestra `error.message` para `card_error`/`validation_error`, un mensaje propio para `payment_intent_authentication_failure` y uno genérico para lo demás. Tiene estados de carga y pago en curso, y el botón "Pay $X" queda deshabilitado hasta que el Element está listo. Destruye el Element al desmontar. Sin `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` muestra un aviso en lugar de fallar. |
| `components/checkout/CheckoutForm.tsx` | modificado | El paso de pago monta `StripePayment`. "Edit address" vuelve al formulario **conservando lo escrito**; el próximo envío cancela el PaymentIntent anterior por el caso B (HAG-93). |
| `components/checkout/ShippingForm.tsx` | modificado | Acepta `initialValues`. Corrige un desborde: en escritorio el ZIP se salía 18 px de la tarjeta (`min-w-0` en las celdas y `w-full` en los campos). |
| `lib/checkout.ts` | modificado | Nueva `reconcileOrderPayment(orderId, client = stripe)`. Si la orden está `PENDING_PAYMENT` con PaymentIntent, lo consulta: `succeeded` → `confirmOrder` (+ email si `confirmed`, `handleOversell` si `oversell`). **Nunca cancela**, porque el cliente puede estar a mitad de 3DS o de un pago en proceso. Si Stripe no responde, se registra en el log y se devuelve el estado actual. Devuelve `{ status, paymentIntentStatus }`. |
| `app/(store)/order-confirmation/[id]/page.tsx` | reescrita | Verifica la propiedad **antes** de reconciliar: sin sesión redirige a login, y si no es el dueño ni ADMIN → `notFound()`. Después llama a `reconcileOrderPayment` y muestra un encabezado según el estado (tabla abajo). Incluye número, fecha, estado, items con imagen de `ProductMedia` (antes usaba `imageUrls`), dirección de envío, subtotal/envío/total, "View All Orders"/"Return to Checkout" y "Continue Shopping". Es responsive. |
| `lib/order-number.ts` | modificado | La fecha del número de orden y la fecha mostrada usan `STORE_TIME_ZONE = "America/New_York"`. Vercel corre en UTC, y en la prueba una orden del 14 de octubre (hora de Florida) salió como `HAG-20261015-…`. |
| `scripts/test-checkout.ts` | modificado | 5 pruebas nuevas de `reconcileOrderPayment`. |

No se agregaron dependencias. `@stripe/react-stripe-js` 7.0 exige `@stripe/stripe-js` ≥ 10 y el proyecto tiene la 9.10, así que se usa la API de `@stripe/stripe-js` directamente.

### Encabezado de la confirmación según el estado

| Estado de la orden (tras reconciliar) | PaymentIntent | Encabezado |
|---|---|---|
| `PAYMENT_CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED` | — | ✅ "Order Confirmed!" |
| `OVERSELL_REFUND_PENDING`, `OVERSELL_REFUND_FAILED` | — | "Item no longer available", con aviso de que se está reembolsando |
| `CANCELLED_REFUNDED` | — | "Order refunded" (5–10 días hábiles) |
| `CANCELLED` | — | "Order cancelled", sin cargo |
| `PENDING_PAYMENT` | `processing` | "Payment processing" |
| `PENDING_PAYMENT` | `requires_payment_method` / `canceled` | "Payment not completed" + "Return to Checkout" |
| `PENDING_PAYMENT` | otro, o Stripe no responde | "Confirming your payment" |

---

## Evidencia

### Pruebas de integración: `scripts/test-checkout.ts` → **34/34 OK**

Las 29 de HAG-92/93 siguen pasando. Las 5 nuevas de `reconcileOrderPayment` corren contra Stripe test real, salvo la última:
- `succeeded` → `PAYMENT_CONFIRMED`, stock 5 → 4 y carrito vacío. Una segunda llamada es idempotente: stock sigue en 4.
- Sin pagar (`requires_payment_method`) → sigue `PENDING_PAYMENT` y el PaymentIntent **no** se cancela.
- Tarjeta rechazada (`pm_card_chargeDeclined`) → `PENDING_PAYMENT` / `requires_payment_method`, se puede reintentar.
- Pagado pero sin stock al volver → 1 refund real → `CANCELLED_REFUNDED`.
- Stripe no responde (cliente simulado) → `{ PENDING_PAYMENT, null }` sin tocar nada.

### Prueba en navegador real (navegador de la app)

App local (`next start`) contra la base PostgreSQL de prueba + Stripe test. Usuario de prueba.

| Escenario | Resultado |
|---|---|
| **4242 4242 4242 4242** (escritorio) | El Payment Element carga (tarjeta, banco, Cash App, Amazon Pay, Link). Stripe redirige con `redirect_status=succeeded` → "Order Confirmed!". En la base: `PAYMENT_CONFIRMED`, $49.98, Miami/FL, stock 5 → 3, carrito vacío. |
| **4000 0000 0000 0002** (rechazada) | "Your card has been declined." sin salir de la página; el botón vuelve a habilitarse. |
| **4000 0025 0000 3155** (3DS) → **FAIL** | Se queda en la página y permite reintentar. El mensaje era genérico, por eso se agregó el de `payment_intent_authentication_failure`. Ese texto nuevo no se re-verificó en el navegador; ver "No verificado". |
| 3DS → **COMPLETE** | Redirige a la confirmación con "Payment Confirmed" (el reintento usa el mismo PaymentIntent). |
| Celular 375 px, `/checkout` | El resumen queda arriba y el formulario abajo; no hay scroll horizontal. El Payment Element preselecciona "United States" y muestra el ZIP. |
| Celular 375 px, confirmación | Datos apilados, el número de orden en una sola línea y la dirección visible. |
| Orden `CANCELLED_REFUNDED` (estado puesto en la base de prueba) | "Order refunded". |
| Orden con PaymentIntent real sin pagar | "Payment not completed" + "Return to Checkout". |

Encontrado y corregido durante la prueba:
- El ZIP se desbordaba en escritorio.
- El número de orden se partía en dos líneas.
- La fecha del número no coincidía con la fecha mostrada (UTC vs. hora local).
- El país de facturación aparecía como "Venezuela" porque Stripe lo detectaba por IP.

### Estático
- `tsc --noEmit --incremental false`: OK.
- `next build`: OK.

### No verificado
- El texto nuevo de autenticación 3DS fallida no se re-verificó en el navegador.
- En el celular **emulado**, el clic dentro del iframe de Stripe no escribía en los campos. Es una limitación de la emulación del navegador de pruebas, no de la tienda. Los pagos se probaron en escritorio y el diseño en celular se verificó visualmente.
- Métodos de pago con redirección externa (Cash App, Amazon Pay, banco) no se probaron. Usan la misma `return_url` y la misma reconciliación.

---

## Despliegue (después del GO; propuesta)

Push conjunto de `bdab016` (HAG-92/93) + HAG-94 a master (Vercel), **en este orden**:
1. **Usuario:** cargar en Vercel (Production) `STRIPE_SECRET_KEY` y `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` **de test**. Obligatorio: `lib/stripe.ts` lanza un error al importarse sin la clave y la clave pública se inyecta en el build.
2. Respaldo (`scripts/backup-db.ts`) → `prisma db execute` de `20261015000000_order_one_pending_per_user` → verificar con `pg_indexes`.
3. Push y verificación en vivo con la tarjeta 4242 (modo test). Después, la orden de prueba se cancela o se ignora desde /admin.

La tienda queda **en modo test**: nadie puede pagar dinero real hasta activar la cuenta de Stripe y cambiar a claves live. Hasta HAG-95 (webhook), la confirmación depende de que el cliente vuelva a `/order-confirmation`, o de que el admin use confirm-payment, que ahora verifica el pago en Stripe.

## Puntos a revisar por el auditor

1. Se mantiene la redirección siempre (no `redirect: "if_required"`) para tener un solo camino de éxito, igual al de los métodos con redirección.
2. `reconcileOrderPayment` corre en un GET de una página de servidor: el GET tiene efectos (confirma o reembolsa). Es idempotente, está condicionado a `succeeded` en Stripe y solo corre después de verificar el dueño.
3. Antes de cobros reales, HAG-95 debe cubrir el caso en que el cliente paga y no vuelve a la página.
