# Solicitud de auditoría — HAG-103 Emails de pedidos con Resend (envío durable)

Fecha: 2026-10-15
Stack: Next.js 16.2.10 + Prisma 5.22 + Resend (SDK 6.17.2) · Hosting: Vercel (Hobby)
Ticket: [HAG-103](https://linear.app/hag-projects/issue/HAG-103)
Base: `f6cc9ee` (HAG-95 en producción, modo test)
Diff para revisar: `AUDITORIA-HAG-Supply-HAG103-cambios.diff`
Estado: **pendiente de veredicto**

---

## Objetivo y criterios heredados

- Ticket: enviar el email de confirmación de compra con todos los datos de la orden, por Resend, desde el dominio verificado.
- **Criterio del auditor (veredicto HAG-95): envío durable.** Antes, el estado se confirmaba antes de enviar y, si el envío fallaba, nada lo reintentaba.
- **Observación menor (HAG-95 v2):** el aviso de `requires_action` se repetía en cada evento. Hay que condicionarlo y deduplicarlo.
- **Requisito para cobros reales:** avisos operativos verificables al admin (refund fallido y pago huérfano).

## Diseño: bandeja de salida transaccional (`EmailOutbox`)

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` + `migrations/20261016000000_email_outbox` | Modelo `EmailOutbox`: `dedupeKey` **única**, `kind` (`ORDER_CONFIRMATION`/`ADMIN_ALERT`), `orderId?`, `to`, `subject`, `html`, `text`, `status` (`PENDING`/`SENDING`/`SENT`/`FAILED`), `attempts`, `lastError`, `providerMessageId`, `nextAttemptAt`, `lockedUntil`, `sentAt`. Índices `(status, nextAttemptAt)` y `orderId`. **Migración aditiva** (2 enums y 1 tabla); se aplica con `db execute`. |
| `lib/confirm-order.ts` | **PASO 5:** `enqueueOrderConfirmation(tx, orderId)` **dentro de la misma transacción** que pasa la orden a `PAYMENT_CONFIRMED`, descuenta stock y vacía el carrito. Si hay rollback por oversell, no queda email; si hay commit, el email existe sí o sí. |
| `lib/oversell.ts` | La transición a `OVERSELL_REFUND_FAILED` (en `applyRefundOutcome` y `markFailed`) y el aviso al admin se escriben en **una sola transacción interactiva**: el aviso solo se encola si `count === 1`. `requires_action` usa `notifyAdmin` con dedupe `refund-requires-action:{orderId}:{refundId}`: **un aviso por refund**, aunque el evento se repita. |
| `lib/stripe-webhook.ts` | Pago huérfano: aviso con dedupe `orphan-payment:{paymentIntentId}`. |
| `lib/order-emails.ts` (reescrito) | Encolar (`createMany … skipDuplicates`, gracias a la `dedupeKey` única), entregar y reintentar. Detalle abajo. |
| `lib/email-templates.ts` (nuevo) | Plantillas HTML con estilos en línea y tablas, más versión texto. **Todo lo dinámico se escapa** (`esc`). Fechas en `America/New_York`. |
| `app/api/webhooks/stripe/route.ts` | Después de procesar cada evento, `deliverPending({ limit: 5 })` reintenta lo vencido. No afecta la respuesta a Stripe. |
| `app/api/cron/email-outbox/route.ts` + `vercel.json` (nuevos) | Cron diario de Vercel (Hobby: una vez al día, 13:00 UTC). Autenticación `Authorization: Bearer CRON_SECRET`: sin secreto → 503, secreto incorrecto → 401. Entrega hasta 50 emails vencidos. |
| `scripts/test-checkout.ts` | 13 pruebas nuevas. Los avisos al admin ahora se cuentan como **filas `ADMIN_ALERT` en la base**, no como logs. El script **borra `RESEND_API_KEY`** al iniciar: nunca envía emails reales. |

### Entrega (`deliverEmail` / `deliverPending`)
- **Reclamo atómico:** `updateMany` `PENDING` (vencido) **o** `SENDING` con lock vencido → `SENDING` con `lockedUntil` +2 min y `attempts++`. Dos procesos no pueden enviar la misma fila; si un proceso muere en `SENDING`, otro la retoma cuando vence el lock.
- **Resend con `Idempotency-Key = dedupeKey`:** si el proceso muere después de enviar y antes de marcar `SENT`, el reintento no duplica el email, dentro de la ventana de idempotencia de Resend.
- **Éxito** → `SENT`, con `providerMessageId` y `sentAt`.
- **Error del proveedor** → `PENDING` con espera creciente (1, 5, 15, 60, 180, 360, 720 y 1440 min). Al **8.º intento** → `FAILED` y `lastError` guardado.
- **Sin `RESEND_API_KEY`** → sigue `PENDING`, **sin gastar intento** (`attempts--`), para enviarse en cuanto haya clave.
- `deliverPending` **no lanza**: un fallo de email nunca rompe el pago ni el webhook.
- **Quién reintenta:** cada evento del webhook, cada nueva llamada para la misma orden (confirmación, reconcile, admin) y el cron diario.

### Remitentes y destinatarios (configurables por variables de entorno)
- `EMAIL_FROM`: por defecto `HAG Supply <orders@hagpartner.com>`. `EMAIL_REPLY_TO`: por defecto `orders@hagpartner.com`, que Cloudflare Email Routing reenvía al dueño. Así el cliente tiene un canal real de respuesta.
- `ADMIN_ALERT_EMAIL`: hagpartnerllc@gmail.com, según decidió el dueño. Por defecto `alertas@hagpartner.com`.
- El dominio `hagpartner.com` está **verificado en Resend** (cuenta de la landing; SPF/DKIM en `send.` y `resend._domainkey`). Clave nueva `hag-supply` con permiso **Sending access**; por limitación de Resend quedó con alcance "All domains" (la cuenta solo tiene `hagpartner.com`).

## Evidencia

### `scripts/test-checkout.ts` → **63/63 OK**
Son las 50 anteriores más 13 de HAG-103, sobre PostgreSQL desechable + Stripe test. El proveedor de email es simulado con un `EmailSender` inyectable.

| Prueba | Resultado |
|---|---|
| `confirmOrder` encola en la misma transacción; oversell (rollback) | 1 email `PENDING` para el comprador; **ningún email** si se revierte |
| Doble `confirmOrder` concurrente | 1 sola confirmación encolada |
| Plantilla | Número, fecha, "Thank you…, Ana!", `2 × $12.50`, total, dirección con línea 2, enlace a `/order-confirmation/{id}`. Un nombre `<script>…` sale **escapado**. La versión texto también es correcta. Remitente, Reply-To e Idempotency-Key correctos. |
| Envío OK | `SENT`, `providerMessageId`, `sentAt`; una nueva entrega no reenvía |
| Sin clave | `not_configured`, sigue `PENDING` con `attempts = 0`; cuando hay proveedor → `SENT` con `attempts = 1` |
| Fallo del proveedor | `retry`; espera ≥ 1 min (antes de tiempo → `skipped`); en el 8.º intento → `FAILED` |
| **3 entregas concurrentes** del mismo email (proveedor lento) | El proveedor recibe **1** envío |
| Lock vencido en `SENDING` | Se retoma y se envía |
| **`requires_action` repetido 3 veces** | **1 aviso** (corrige la observación de HAG-95 v2) |
| Aviso de refund fallido | Va a `ADMIN_ALERT_EMAIL` con orderId, refundId y enlace a `/admin/orders/{id}` |
| Pago huérfano repetido | 1 aviso |
| Webhook `payment_intent.succeeded` con pago real | Orden confirmada y confirmación encolada (`PENDING`, porque las pruebas no tienen clave) |
| Cron | 503 / 401 / 200 con conteos |

Las 5 pruebas de concurrencia de HAG-95 v2 ahora verifican **1 fila `ADMIN_ALERT`** por refund fallido.

### Envío real (Resend producción, dominio verificado)
Dos emails de prueba (confirmación de pedido con datos de ejemplo y aviso al admin) desde `orders@hagpartner.com` a hagpartnerllc@gmail.com. Resend devolvió los IDs `01a14238-4ca0-…` y `01a14238-4d2a-…`, y **los dos llegaron a la bandeja de entrada de Gmail** (pestaña Updates), **no a spam**, verificado con el conector de Gmail. El snippet muestra el saludo, el número y la fecha.

### Estático
- `tsc --noEmit --incremental false`: OK.
- `next build`: OK, con `ƒ /api/cron/email-outbox`.

## Despliegue (después del GO)

1. Respaldo de producción → `prisma db execute` de `20261016000000_email_outbox` → verificar la tabla y los enums. Debe hacerse **antes** del push, porque `confirmOrder` ya escribe en `EmailOutbox`.
2. **Reply-To que recibe correo:** al probar, un correo enviado a `resend@hagpartner.com` rebotó. Cloudflare Email Routing solo reenvía las direcciones con regla (o todas, si está activo el catch-all). **Antes de publicar**, el dueño crea la regla `orders@hagpartner.com` → su Gmail (o activa el catch-all), y se verifica con un envío real a esa dirección. Si no, las respuestas de los clientes a la confirmación rebotan.
3. **Usuario, en Vercel (Production):** `RESEND_API_KEY` (Secret), `ADMIN_ALERT_EMAIL=hagpartnerllc@gmail.com` y `CRON_SECRET` (cadena aleatoria larga, Secret).
4. Push → Vercel registra el cron de `vercel.json`.
5. Verificación en vivo: compra de prueba (modo test) → el email de confirmación llega al comprador de prueba. Después, limpieza.

## Puntos a revisar por el auditor

1. En Hobby, el cron corre **una vez al día**. El reintento "rápido" depende de los eventos del webhook y de nuevas visitas o llamadas. Con un fallo prolongado de Resend, un email puede tardar hasta el siguiente cron. ¿Es aceptable para modo test y para la primera etapa live?
2. La plantilla se renderiza **al encolar**, dentro de la transacción: el email refleja la orden en el momento de confirmarse.
3. El reintento de `requires_action` en eventos posteriores ya no genera avisos. Si un refund sigue `pending` por días, no hay un aviso adicional (se ve en /admin).
4. La clave API tiene alcance "All domains" (cuenta con un solo dominio).
