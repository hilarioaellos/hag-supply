# Solicitud de auditoría — HAG-123 Aviso de venta nueva + HAG-124 Aislamiento de pagos de pruebas

Fecha: 2026-10-16
Base: `f520e86` (HAG-103 en producción, modo test)
Diff para revisar: `AUDITORIA-HAG-Supply-HAG123-HAG124-cambios.diff`
Estado: **pendiente de veredicto**

---

## HAG-123 — Aviso al dueño por cada venta nueva

**Pedido del dueño:** recibir en su Gmail un email por cada compra. Hasta ahora `ADMIN_ALERT_EMAIL` solo recibía avisos de problemas.

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` + `migrations/20261016010000_email_kind_new_order` | `EmailKind` suma `ADMIN_NEW_ORDER` (`ALTER TYPE … ADD VALUE IF NOT EXISTS`, aditiva). Es un tipo propio para no mezclarlo con los avisos de problemas, que las pruebas y la operación cuentan aparte. |
| `lib/order-emails.ts` | `enqueueOrderConfirmation` → **`enqueueOrderEmails(tx, orderId)`**. En **una sola** `createMany … skipDuplicates`, dentro de la transacción de `confirmOrder`, encola la confirmación al comprador (`order-confirmation:{id}`) y el aviso de venta (`admin:new-order:{id}`, kind `ADMIN_NEW_ORDER`). Destinatario: `ORDER_NOTIFY_EMAIL` ?? `ADMIN_ALERT_EMAIL` ?? `alertas@hagpartner.com`. |
| `lib/confirm-order.ts` | El PASO 5 llama a `enqueueOrderEmails`. Si hay rollback por oversell, no queda ninguno de los dos; si se confirma, quedan ambos. |
| `lib/email-templates.ts` | `renderNewOrderNotification`: asunto `[HAG Supply] New order {número} — ${total}`, total, número, fecha y hora (America/New_York), cantidad de unidades, cliente y email, items, total, dirección y botón "Open order in admin". Todo lo dinámico se escapa. Versión texto incluida. |

La entrega no cambia: misma outbox, reclamo con token, reintentos y barridos. `sendOrderConfirmation(orderId)` ya entrega todos los pendientes de la orden (`limit 3`), así que manda los dos.

## HAG-124 — Incidente: avisos falsos de "pago sin orden" causados por las pruebas

**Qué pasó (2026-10-16):** `scripts/test-checkout.ts` confirma pagos reales en la **cuenta de Stripe de prueba**, que es la **misma** que usa producción (modo test). Stripe entregó esos `payment_intent.succeeded` al **webhook de producción**, que no encontró la orden (vive en la base local de pruebas) y envió el aviso "Payment received without an order".
- **73 avisos falsos** a hagpartnerllc@gmail.com (60 entre la noche del 15 y esta mañana, y 13 más por un filtro de pruebas mal armado en esta sesión).
- Unos 74 de los 100 emails diarios del plan gratis de Resend.
- Sin efecto en dinero, pedidos ni stock: todo fue modo test, y los avisos son solo filas `ADMIN_ALERT` en la outbox de producción.
- No se puede usar un sandbox de Stripe separado hasta activar la cuenta live.

**Corrección:**

| Archivo | Cambio |
|---|---|
| `lib/app-origin.ts` (nuevo) | `appOrigin()` = host de `NEXTAUTH_URL` (`supply.hagpartner.com` en producción; `localhost:3000` en local). |
| `lib/checkout.ts` | Cada PaymentIntent guarda `metadata.origin = appOrigin()`. |
| `lib/stripe-webhook.ts` | Pago sin orden con `metadata.origin` **distinto** del propio → `ignored:foreign_origin`: 200, log informativo, **sin aviso**. Sin marca (PaymentIntents anteriores) o del propio origen → aviso como antes. Los pagos **con** orden se procesan igual que antes (la búsqueda es por `stripePaymentIntentId`). |
| `scripts/test-checkout.ts` | Variable `TEST_ONLY=<regex>` para correr un subconjunto, y conteo de omitidas. |

**Límite reconocido:** el webhook de producción sigue **recibiendo** los eventos de las pruebas; solo deja de avisar por ellos. Los eventos de refund de las pruebas ya se ignoraban (no hay orden con ese refund). La separación completa llega con un sandbox o una cuenta propia para pruebas, cuando se active la cuenta live.

## Evidencia

- **Suite completa antes del cambio de origen: 77/77 OK, dos corridas seguidas** (HAG-123 incluido). Dos pruebas viejas se ajustaron porque ahora cada orden tiene 2 emails: cuentan solo la confirmación. Una que asumía `providerMessageId = msg_1` se volvió independiente del orden de envío, porque los dos emails comparten `createdAt`.
- **Después del cambio de origen: 33/33 OK** con `TEST_ONLY`, limitado a pruebas que **no confirman pagos en Stripe**, para no generar más avisos en producción mientras la corrección no está desplegada. Incluyen:
  - las 4 de HAG-123: encolado con la confirmación; rollback sin avisos; 3 confirmaciones concurrentes → 1 aviso; elección de destinatario por variables; entrega de los 2 emails, cada uno a su destinatario;
  - las 3 de HAG-124: `metadata.origin` guardado en el PaymentIntent real (sin confirmarlo); huérfano de **otro origen** → 200, `ignored:foreign_origin` y **0 filas**; huérfano del **mismo origen** → `orphan_payment` y 1 fila;
  - todas las de outbox, lock, timeout, presupuesto, `requires_action`, cron y firma.
- **Verificado:** esa corrida no creó avisos en producción (contador de huérfanos en 73, antes y después).
- `tsc --noEmit --incremental false`: OK. `next build`: OK.
- **Muestra real del aviso de venta** (Resend id `01a14547-c891-…`, a hagpartnerllc@gmail.com): Resend la aceptó (`sent`), pero a los ~15 min seguía sin `delivered` y no aparecía en Gmail, probablemente demorada por la ráfaga de 73 avisos del mismo remitente. **Queda pendiente** confirmar la recepción con la compra de prueba posterior al despliegue.

## Despliegue (después del GO)

1. Respaldo → `prisma db execute` de `20261016010000_email_kind_new_order` → verificar el valor del enum. **Antes del push**, porque `confirmOrder` ya escribe `ADMIN_NEW_ORDER`.
2. Push (no hacen falta variables nuevas: el aviso va a `ADMIN_ALERT_EMAIL`).
3. **Suite completa** (80 pruebas) desde local: debe pasar **y el contador de avisos huérfanos de producción no debe moverse**. Es la verificación en vivo de HAG-124.
4. Compra de prueba en la tienda: llegan la confirmación al comprador y **"New order …"** a hagpartnerllc@gmail.com. Después, limpieza.

## Puntos a revisar

1. Que `metadata.origin` venga de `NEXTAUTH_URL`. Si producción tuviera un `NEXTAUTH_URL` mal configurado, sus propios huérfanos se ignorarían; hoy es `https://supply.hagpartner.com`, verificado en Vercel.
2. Ignorar un huérfano de otro origen **sin aviso**: en modo test es correcto. En live habrá destinos y claves propias, y la marca deja de ser necesaria.
