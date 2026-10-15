# Re-auditoría — HAG-94 Stripe Payment Element y página de confirmación (v2)

Fecha: 2026-10-14
Veredicto anterior (v1): **NO-GO** por 2 hallazgos mayores y observaciones menores. El texto de las menores llegó cortado: se atendió la de `try/catch/finally` en `confirmPayment`.
Documento base: `AUDITORIA-HAG-Supply-HAG94.md`. El alcance y la propuesta de despliegue no cambian.
Estado: **pendiente de veredicto**

---

## 1. MAYOR — Recargar la confirmación no recuperaba un reembolso pendiente → RESUELTO

`lib/checkout.ts:314`. Ahora `reconcileOrderPayment` **retoma `OVERSELL_REFUND_PENDING`**:
- Llama a `handleOversell(orderId, client)`, que reutiliza el `stripeRefundId` guardado (`refunds.retrieve`). Si no hay ID, busca por `metadata.orderId` y crea el refund con `idempotencyKey: refund-{orderId}`.
- Después relee el estado y lo devuelve.
- Una excepción en el reintento se registra en el log y deja el estado como está.
- Toda visita del dueño a `/order-confirmation/[id]` es entonces una ruta de recuperación implementada, que se suma al webhook previsto en HAG-95.

**Validación pedida → hecha, desde `reconcileOrderPayment`:**

| Prueba | Resultado |
|---|---|
| Refund **pendiente real**: pago con `pm_card_pendingRefund`, el PaymentMethod de prueba de la tarjeta **4000 0000 0000 7726**, y luego sin stock | 1.ª reconciliación → `OVERSELL_REFUND_PENDING` con `stripeRefundId` guardado; en Stripe el refund está `pending`. **La recarga** sigue `OVERSELL_REFUND_PENDING` y **sigue habiendo 1 refund**. Cuando Stripe lo concluye (simulado: solo `refunds.retrieve` responde `succeeded`, lo demás es real) → `CANCELLED_REFUNDED` con el **mismo** `stripeRefundId` y 1 refund. |
| **Error transitorio** al crear el refund, seguido de recarga | 1.ª reconciliación con `refunds.create` fallando → `OVERSELL_REFUND_PENDING` sin `stripeRefundId` y 0 refunds en Stripe. **La recarga** con Stripe test real → `CANCELLED_REFUNDED` con 1 refund. Otra recarga → sigue habiendo 1 refund. |
| (Informativo) refund pendiente real sondeado 92 s, sin simular nada | Siguió `OVERSELL_REFUND_PENDING` con 1 refund. En modo test, Stripe tarda más de 90 s en concluir un refund `pending`; por eso el paso pendiente → completado se valida simulando el `retrieve`. |

## 2. MAYOR — Un reembolso fallido se mostraba como pendiente → RESUELTO

`app/(store)/order-confirmation/[id]/page.tsx`. Ahora cada estado tiene su propia etiqueta y su propio texto. Los mensajes de devolución en curso o completada se usan solo en sus estados:

| Estado | Etiqueta | Encabezado y texto (verificados en el navegador) |
|---|---|---|
| `OVERSELL_REFUND_PENDING` | **Refund in Progress** | "Refund in progress" — empezamos un reembolso total, **todavía no se completó**, recargá más tarde. El plazo de 5–10 días se menciona solo como "una vez completado". |
| `OVERSELL_REFUND_FAILED` | **Refund Failed** | "We couldn't refund you automatically" — el reembolso automático **no pudo completarse**. La orden quedó marcada para el equipo, que hará el reembolso a mano y escribirá a `<buyerEmail>`; el cliente no tiene que hacer nada. |
| `CANCELLED_REFUNDED` | **Refunded** | "Order refunded" — reembolsado en su totalidad; llega en 5–10 días hábiles. |

Sobre el "procedimiento de atención": hoy el aviso al admin por email es solo un log (HAG-103). La única señal real es la **alerta roja del dashboard /admin**, que lista las órdenes `OVERSELL_REFUND_FAILED` (`app/admin/page.tsx`). Por eso el texto dice que la orden "está marcada para el equipo" y no que el equipo "fue notificado". La tienda no tiene un canal de contacto público (se quitaron el teléfono y el email ficticios en HAG-116), así que el texto compromete el contacto al email del comprador.

**Validación:** tres órdenes de prueba del mismo usuario, una por estado, vistas en el navegador de la app. Coinciden la etiqueta y el texto de cada una. La orden `PENDING` tiene un `stripeRefundId` ficticio, así que la recarga produce un error transitorio y la orden **se mantiene** en "Refund in Progress", sin pasar a fallido.

## Observación menor atendida

`components/checkout/StripePayment.tsx:81`: `confirmPayment` va dentro de `try/catch/finally`. Si Stripe.js o la red lanzan una excepción, se muestra "We couldn't reach the payment provider…" y `finally` siempre libera el estado de pago (`setPaying(false)`), así que el botón no queda bloqueado.

---

## Evidencia general

- `scripts/test-checkout.ts` → **37/37 OK**: las 34 anteriores más las 3 de esta ronda. Corren contra PostgreSQL local desechable y Stripe test real.
- `tsc --noEmit --incremental false`: OK.
- `next build`: OK.

## Fuera de alcance (detectado en la prueba)

- **Encabezado, `components/layout/Header`** (anterior a HAG-94, no se modificó): con un viewport de 324 px el botón del buscador sobresale hasta 427 px y aparece scroll horizontal en **todas** las páginas. A 375 px no se observó. Se propone como ticket aparte.
- El aviso "Card payments are not configured. Please contact us…" de `StripePayment` no tiene canal de contacto. Solo aparece si falta la clave pública, y el despliegue la exige.
