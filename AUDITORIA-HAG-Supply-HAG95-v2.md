# Re-auditoría — HAG-95 Webhook de Stripe (v2)

Fecha: 2026-10-15
Veredicto anterior (v1): **NO-GO** por 1 mayor reproducido (`AUDITORIA-HAG-Supply-HAG95-veredicto.md`): un `refund.failed` concurrente con un `succeeded` del mismo refund terminaba en `SKIPPED` y la orden quedaba `CANCELLED_REFUNDED`, sin aviso.
Aprobados en la v1: regla `CANCELLED_REFUNDED → OVERSELL_REFUND_FAILED`, pago huérfano → 200 con revisión manual, secreto ausente → 500.
Documento base: `AUDITORIA-HAG-Supply-HAG95.md`
Diff para revisar: `AUDITORIA-HAG-Supply-HAG95-v2-cambios.diff` (contra `4df84bf`; incluye v1 y v2)
Estado: **pendiente de veredicto**

---

## MAYOR — Fallo de refund perdido bajo concurrencia → RESUELTO

### Causa
- El paso de **failed** solo aceptaba `OVERSELL_REFUND_PENDING`.
- `onRefundChanged` decidía el camino (pendiente vs. `CANCELLED_REFUNDED`) con una **lectura previa** del estado. Si otro actor cambiaba la orden entre esa lectura y la escritura, el fallo no se registraba.

### Corrección: una transición atómica compartida
`applyRefundOutcome(orderId, refund)` en `lib/oversell.ts:71`. La usan `handleOversell` (también desde `payment_intent.succeeded`) y los eventos `refund.updated`/`refund.failed`. Ninguno decide con lecturas previas: el estado de la orden lo resuelve el `WHERE` de un único `UPDATE`.

| Refund en Stripe | `UPDATE … WHERE` (atómico) | Efecto |
|---|---|---|
| `succeeded` | `status = OVERSELL_REFUND_PENDING AND (stripeRefundId IS NULL OR = refund.id)` | `→ CANCELLED_REFUNDED`. **Nunca** desde `OVERSELL_REFUND_FAILED`, así que un `succeeded` atrasado no revierte un fallo. |
| `failed` / `canceled` | `(status = OVERSELL_REFUND_PENDING AND (stripeRefundId IS NULL OR = refund.id)) OR (status = CANCELLED_REFUNDED AND stripeRefundId = refund.id)` | `→ OVERSELL_REFUND_FAILED`, **en ambos intervalos de la carrera**. El fallo es absorbente. |
| `requires_action` | — | Sigue pendiente, con aviso. |
| `pending` | — | Sigue pendiente. |

- **El aviso al admin sale solo si `count === 1`**, es decir, una vez por transición efectiva.
- Si `count === 0`, `skippedAfter` relee el estado. Es normal si ya está en el estado final (eventos duplicados). Si el estado es incompatible con ese refund, por ejemplo `CANCELLED_REFUNDED` con **otro** refund, se registra en el log para revisión.

`onRefundChanged` (`lib/stripe-webhook.ts:80`):
- Busca la orden de forma **determinista**: primero por `stripeRefundId` y después por `metadata.orderId`. En la v1, `findFirst` con `OR` podía devolver cualquiera de las dos órdenes.
- Comprueba que el refund pertenezca a la orden.
- Consulta el refund **vigente** con `refunds.retrieve`, porque el payload del evento puede estar desactualizado. Si esa consulta falla → 5xx y reintento.
- Aplica `applyRefundOutcome`. Ya **no** tiene ramas por el estado leído.

### Validación pedida → hecha con **PostgreSQL desechable real** y Stripe controlado

Cada actor tiene su propio cliente, cuyo `refunds.retrieve` se pausa **después** de que el handler leyó la orden (pendiente). Así se fuerzan ambos intervalos.

| Prueba | Resultado |
|---|---|
| **Secuencia del auditor:** A `refund.updated` (succeeded) y B `refund.failed` leen la orden pendiente; se libera A, luego B | A → `refund:CANCELLED_REFUNDED`; **B → `refund:OVERSELL_REFUND_FAILED`**. Final **`OVERSELL_REFUND_FAILED`**, **1 aviso**, **0 refunds nuevos**. |
| **Orden inverso:** se libera B (failed), luego A (succeeded atrasado) | B → `OVERSELL_REFUND_FAILED`; A → `refund:SKIPPED`. Final **`OVERSELL_REFUND_FAILED`** (no se revierte), 1 aviso, 0 refunds nuevos. |
| Misma carrera por el **camino `handleOversell`**: `payment_intent.succeeded` reenviado con la orden pendiente + `refund.failed` | A → `oversell:CANCELLED_REFUNDED`; B → `OVERSELL_REFUND_FAILED`. Final `OVERSELL_REFUND_FAILED`, 1 aviso, 0 refunds nuevos. |
| Dos `refund.failed` del mismo refund en paralelo | Resultados `[OVERSELL_REFUND_FAILED, SKIPPED]`, **1 aviso**. |
| Refund guardado en la orden RC5 con `metadata.orderId` de RC6 | Se resuelve por `stripeRefundId` (RC5); RC6 no cambia. |
| `refund.failed` después de `CANCELLED_REFUNDED` (secuencial, pago y refund reales) | `OVERSELL_REFUND_FAILED` con 1 aviso; repetirlo → `SKIPPED` sin otro aviso. |

Los avisos se cuentan sobre la salida de `notifyAdminRefundFailed`, que hoy es el log `[order-emails] REFUND FALLIDO en la orden <id>`, interceptando `console.error` en el script.

**Sobre `scripts/audit-hag95-race.ts` (del auditor, no modificado):** su simulación de `updateMany` compara cada clave del `where` por igualdad simple, así que no evalúa los predicados `OR` anidados de la corrección. Contra el código nuevo devolvería `count: 0` en todas las transiciones y no es representativo. La evidencia válida son las pruebas de arriba, sobre PostgreSQL real, como pidió el veredicto.

## Ajustes de documentación pedidos en el veredicto

- **Reintentos de Stripe:** en modo **test/sandbox** son unos 3 reintentos en pocas horas, no días; en live, hasta 3 días. Si falta `STRIPE_WEBHOOK_SECRET` al probar, el evento puede perderse para siempre: se reenvía a mano desde el panel de Stripe (Workbench → Events → Resend).
- **Formato de los eventos:** el código espera eventos **snapshot** (`data.object`). Al crear el destino en Stripe hay que elegir *snapshot*, no *thin*, con la versión de API del SDK (`2026-06-24.dahlia`).
- **Antes de habilitar cobros reales** (según el veredicto):
  - HAG-103 con **envío durable de emails**. Hoy el estado se confirma antes de enviar el email; si el envío falla, no se reintenta. Queda registrado como criterio de aceptación en HAG-103.
  - Aviso operativo verificable para pagos huérfanos y refunds fallidos.
  - Claves live.
  - **Un destino de webhook live aparte, con su propio signing secret**, y verificar la entrega y la confirmación sin que el comprador vuelva a la página.

## Evidencia general

- `scripts/test-checkout.ts` → **50/50 OK**: 45 de la v1 más 5 de concurrencia. Se ajustaron dos expectativas por el cambio de diseño: las acciones de los eventos de refund ahora son `refund:<resultado>`, y W5 usa un cliente que informa `failed`, porque el webhook consulta el refund vigente en Stripe.
- `tsc --noEmit --incremental false`: OK.
- `next build`: OK.

## Despliegue (después del GO; sin cambios respecto de la v1)

Commit y push → crear el destino en Stripe test (snapshot; `payment_intent.succeeded`, `refund.updated`, `refund.failed`) → `STRIPE_WEBHOOK_SECRET` en Vercel + Redeploy → compra de prueba **sin volver** a la confirmación y verificación de entregas con 200 → limpieza.
