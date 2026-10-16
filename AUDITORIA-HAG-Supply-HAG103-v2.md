# Re-auditoría — HAG-103 Emails de pedidos con Resend (v2)

Fecha: 2026-10-15
Veredicto anterior (v1): **NO-GO** por 2 mayores reproducidos (`AUDITORIA-HAG-Supply-HAG103-veredicto.md`). Aprobados en la v1: render al encolar y escape de HTML; clave Sending access/All domains; diseño transaccional de confirmaciones y refunds fallidos.
Documento base: `AUDITORIA-HAG-Supply-HAG103.md`
Diff para revisar: `AUDITORIA-HAG-Supply-HAG103-v2-cambios.diff` (contra `f6cc9ee`; incluye v1 y v2)
Estado: **pendiente de veredicto**

---

## 1. MAYOR — Aviso de pago huérfano perdido si falla su escritura → RESUELTO

`notifyAdmin` (`lib/order-emails.ts:244`) separa **persistencia** de **entrega**:
- `enqueueAdminAlert` ya **no** va dentro de un try/catch. Si falla la escritura, el error se propaga: `onPaymentSucceeded` lanza, la ruta responde **500** y Stripe reintenta el evento.
- Si el aviso quedó encolado (o ya existía por dedupe), la entrega va por `deliverPending`, que no lanza. Un error del proveedor lo resuelve la bandeja de salida y el webhook responde 200.

`requires_action` (`lib/oversell.ts:105`) ya no usa `notifyAdmin`: encola dentro de una transacción (punto 3), y un fallo al encolar también se propaga.

**Pruebas de aceptación (PostgreSQL real; el fallo se simula con un middleware de Prisma que hace fallar el próximo `EmailOutbox.createMany`):**

| Prueba | Resultado |
|---|---|
| Pago huérfano por la **ruta real** (POST firmado), con fallo de escritura | **HTTP 500, 0 filas**. El reenvío da **200 y 1 fila**; un tercer envío da 200 y sigue habiendo 1 fila (dedupe). |
| `requires_action` con fallo de escritura | `handleStripeEvent` **rechaza** (la ruta respondería 5xx) y no hay filas. El reintento da `refund:REFUND_PENDING` y **1 fila**. |

## 2. MAYOR — Un dueño viejo del lock pisaba el resultado del nuevo → RESUELTO

`deliverEmail`:
- **Token de reclamo:** columna nueva `claimToken`. Se agregó a la migración aditiva `20261016000000_email_outbox`, que todavía no se aplicó en producción. Cada reclamo escribe un `randomUUID()`.
- **Todas las escrituras finales** (éxito, error y `not_configured`) usan `updateMany({ where: { id, status: "SENDING", claimToken } })` (`owned`, línea 134). Si `count !== 1`, la ejecución perdió el reclamo: **no modifica la fila**, lo registra (`lostClaim`) y devuelve `skipped`.
- **Tiempo de envío acotado:** `withTimeout(sender(...), EMAIL_SEND_TIMEOUT_MS)`, por defecto **15 s**, muy por debajo del lock de 2 min. En condiciones normales el lock no vence mientras se espera al proveedor. Si igual vence (por ejemplo, la base de datos está lenta), el token impide pisar el resultado de otra ejecución.
- La ventana de 24 h de idempotencia de Resend queda como capa extra; ya no es la que garantiza el estado local.

**Pruebas de aceptación** (A queda pausada dentro del proveedor; su lock se fuerza a vencido sin esperar 2 min):

| Prueba | Resultado |
|---|---|
| A vence → **B envía OK** → **A termina con error** | A → `skipped`; la fila queda **`SENT` con el `providerMessageId` de B** |
| A vence → **B reclama** (pausada) → **A termina OK** | A → `skipped`; la fila sigue **`SENDING` con el token de B**. Al liberar B → `SENT` con el id de B. |
| Rama **`not_configured`**: A vence → B envía OK → A recibe "sin clave" | Sigue `SENT`; **`attempts` no se descuenta** |
| Proveedor que nunca responde (`EMAIL_SEND_TIMEOUT_MS=200`) | `retry`, `PENDING`, `claimToken` nulo, `lastError` "tiempo de envío agotado" |

## 3. Observaciones de la v1

| Observación | Estado |
|---|---|
| **`requires_action` sin condición de estado e identidad** | **Resuelta.** Transacción: `updateMany` de la orden con `status = OVERSELL_REFUND_PENDING AND (stripeRefundId IS NULL OR = refund.id)`. Solo si `count === 1` se encola el aviso, dentro de la misma transacción. El `UPDATE` bloquea la fila hasta el commit, así una resolución concurrente no se cruza con el aviso. Pruebas: orden ya `CANCELLED_REFUNDED` → `SKIPPED`, **0 avisos**; refund **distinto** al guardado → `SKIPPED`, 0 avisos, refund guardado intacto; 3 eventos repetidos aplicables → 1 aviso. |
| **Tiempo del webhook** | **Acotado.** `deliverPending` acepta `budgetMs`: no empieza envíos nuevos pasado el presupuesto, y cada envío tiene su timeout. Barrido del webhook: `limit 3, budgetMs 5000`; avisos y confirmaciones: `limit 3, budgetMs 8000/10000`. Se corrigió el comentario: los errores no cambian la respuesta, pero sí la demoran. Prueba: 4 vencidos, proveedor de 300 ms, presupuesto 450 ms → envía 1–2 y deja el resto `PENDING`, en menos de 1 s. |
| **Reintento desde visitas** | **Implementado.** `reconcileOrderPayment` con una orden ya pagada llama a `sendOrderConfirmation`, que entrega su email pendiente. Prueba: visitar la confirmación de una orden `PAYMENT_CONFIRMED` produce un intento de entrega (`lastError` "RESEND_API_KEY no configurada" en pruebas). La redacción de la v1 sobre "toda nueva llamada" queda acotada a: barrido del webhook, cron y visita a la confirmación de esa orden. |
| **Emails `FAILED` sin vista ni reencolado en /admin** | **Ticket aparte, antes de live:** [HAG-121](https://linear.app/hag-projects/issue/HAG-121). |
| **Cron diario insuficiente para live** | **Ticket aparte, requisito de live:** [HAG-122](https://linear.app/hag-projects/issue/HAG-122). Para modo test se acepta, según la v1. |

## 4. Bug adicional encontrado y corregido en esta ronda

Al correr la suite, una prueba de envío inmediato falló **de forma intermitente**. `nextAttemptAt` lo fija el motor de Prisma (`@default(now())`) y la comparación usaba el reloj de Node. En el mismo milisegundo, una diferencia de ~1 ms hacía que un email recién encolado **no** contara como vencido, y el envío inmediato lo saltaba hasta el siguiente barrido. Corrección: `DUE_TOLERANCE_MS = 1 s` (`lib/order-emails.ts:40`), aplicada **solo** a `nextAttemptAt`. Los locks siguen comparándose con la hora exacta, así no se reclaman antes de vencer, y la espera mínima de reintento (1 min) no se ve afectada.

## 5. Reply-To verificado

Antes rebotaba un correo a una dirección `@hagpartner.com` sin regla. El dueño creó en Cloudflare Email Routing la regla para `orders@hagpartner.com`. **Verificado:** un correo real enviado por Resend a `orders@hagpartner.com` (id `01a14245-fd32-…`) llegó a la bandeja de entrada de hagpartnerllc@gmail.com. Las respuestas de los clientes ya no rebotan.

## Evidencia general

- `scripts/test-checkout.ts` → **73/73 OK** (63 de la v1 + 10 nuevas). PostgreSQL desechable + Stripe test; nunca envía emails reales (borra `RESEND_API_KEY` y `ADMIN_ALERT_EMAIL` al iniciar).
- `tsc --noEmit --incremental false`: OK.
- `next build`: OK.
- `scripts/audit-hag103.ts` (del auditor) no se modificó.

## Despliegue (después del GO; actualizado)

1. Respaldo → `prisma db execute` de `20261016000000_email_outbox` (ahora con `claimToken`) → verificar la tabla y los enums. **Antes del push.**
2. ~~Reply-To~~: hecho y verificado (punto 5).
3. Usuario, en Vercel (Production): `RESEND_API_KEY` (Secret), `ADMIN_ALERT_EMAIL=hagpartnerllc@gmail.com`, `CRON_SECRET` (Secret).
4. Push → Vercel registra el cron.
5. Compra de prueba (modo test): llega el email de confirmación. Después, limpieza.
