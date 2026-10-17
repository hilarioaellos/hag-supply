# Auditoría v3 — HAG Supply · Cancelar y reembolsar desde el admin

**Fecha:** 2026-10-16 · **Base:** `d96b11a` · **Diff completo:** `AUDITORIA-HAG-Supply-CancelarReembolsar-v3-cambios.diff` (20 archivos; reemplaza al de v2)
**Responde a:** `AUDITORIA-HAG-Supply-CancelarReembolsar-v2-veredicto.md` (correcciones de v1 aceptadas; NO-GO por un P2 nuevo y dos observaciones menores).
**Estado:** sin commit y sin migración en producción (ni la inicial ni esta).

## 1. [P2] "Refund issued" ligado al refund concreto — CORREGIDO

Cambios en `lib/order-emails.ts`, `lib/oversell.ts` y `lib/order-cancel.ts`:

1. **Clave por pedido y refund.** `enqueueRefundIssuedEmail(tx, orderId, refundId)` usa `order-refunded:{orderId}:{refundId}`.
   - El aviso de B (refund manual de reemplazo) es un hecho distinto del de A: la deduplicación de A ya no lo descarta.
   - Repetir el mismo hecho (evento duplicado, cierre repetido) sigue deduplicado.
   - Llamadas: `applyRefundOutcome` (`succeeded`) pasa `refund.id`; `markRefundedManually` pasa el refund verificado.
2. **Anulación al fallar.** En la transición a `CANCEL_REFUND_FAILED` de `applyRefundOutcome` (misma transacción que la transición y el aviso al admin), `cancelRefundIssuedEmail(tx, orderId, refund.id)` pasa a `CANCELLED` el aviso de **ese** refund si está `PENDING` o `FAILED`. Un aviso agotado tampoco se puede revivir con Retry: `requeueFailedEmail` solo actúa sobre `FAILED`.
3. **Vigencia al enviar.** En `deliverEmail`, la comprobación de v2 se generaliza en `staleReason(email)`, que se evalúa justo antes de llamar al proveedor, también al retomar un reintento o un reclamo vencido:
   - `ORDER_CONFIRMATION`: se anula si el pedido está cancelado (sin cambios);
   - `ORDER_REFUNDED`: **solo se envía si el pedido está `CANCELLED_REFUNDED` con `stripeRefundId` igual al refund de su clave**. Si ese refund falló o fue reemplazado, queda `CANCELLED`, se devuelve el intento y el resultado es `"cancelled"`, sin llamar al proveedor.

   Un envío ya en curso en el proveedor no se intenta retirar.

**Pruebas nuevas** (las tres encadenan el fallo tardío, el cierre manual, la entrega y la deduplicación):

| Caso | Resultado |
|---|---|
| A `succeeded` con aviso **pendiente** → webhook `refund.failed` de A → barrido de la bandeja → cierre manual B → barrido → cierre repetido y evento `refund.updated` de B | El aviso de A queda `CANCELLED` y **no se envía**. B genera **un** aviso nuevo, que se envía **una** vez. El cierre repetido da 409. El evento de B no duplica: 2 filas `ORDER_REFUNDED` (A anulada y B). Estado final `CANCELLED_REFUNDED` |
| Aviso de A **agotado** (`FAILED`, 8 intentos) → A falla → B manual | A queda `CANCELLED` y `requeueFailedEmail` no lo revive. B genera su propio aviso `PENDING` |
| Aviso de A **en vuelo** (`SENDING`, lock vigente) cuando A falla → vence el lock → se retoma | No se pisa mientras está en vuelo. Al retomarlo, `deliverEmail` devuelve **`cancelled`** con 0 llamadas al proveedor |

**Script del auditor `scripts/audit-cancel-refund-v2.cjs`:** contra el código nuevo se detiene en la aserción que reproducía el caso A. Esperaba `sent` (el anuncio obsoleto salía) y ahora obtiene **`cancelled`**. El defecto ya no se reproduce.

## 2. Observaciones menores — CORREGIDAS

- **Error de consulta a Stripe en el cierre manual.** Solo `code === "resource_missing"` o `statusCode 404` responde 422 "Stripe has no refund with that ID". Cualquier otra excepción (timeout, conexión, auth) responde **502** "Couldn't reach Stripe to check that refund. Try again in a moment.", se registra en el log y el pedido no cambia. Probado con ambos tipos de error.
- **Aviso al admin (`cancelRefundFailedAlert`)** ajustado a hechos verificables: *"A cancellation email saying the refund is being processed was queued for the customer; no "Refund issued" email will go out for this refund. Refund them from the Stripe dashboard, then record that refund on the order ("Mark refunded") so they are notified."*

## Validación

- **Suite `scripts/test-checkout.ts`: 116/116 OK** (95 previas + 21 de cancelación) contra PostgreSQL 18 local desechable, incluido Stripe test real. Contador de avisos huérfanos en producción **73 → 73**.
- `npx tsc --noEmit` OK. `npx next build` OK.
- La migración no cambia respecto de v2. Sigue sin aplicarse en ninguna base de producción; se aplicará completa (con respaldo y `db execute`, antes del push) tras el GO.

## Despliegue propuesto (tras GO)

1. Commit (sin `SearchBar.tsx` ni los `scripts/audit-*.cjs`).
2. Respaldo con `scripts/backup-db.ts`.
3. `prisma db execute` de `20261017000000_order_cancel_refund` y verificación de valores de enum y columnas.
4. Push → Vercel. Verificar que `POST /api/admin/orders/x/cancel` y `/manual-refund` sin sesión respondan 401.
