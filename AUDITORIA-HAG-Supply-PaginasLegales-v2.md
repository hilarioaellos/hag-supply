# Auditoría v2 — HAG Supply · Páginas legales y de contacto

**Fecha:** 2026-10-16 · **Base:** `39457f2` · **Diff completo:** `AUDITORIA-HAG-Supply-PaginasLegales-v2-cambios.diff` (11 archivos; reemplaza al de v1)
**Responde a:** `AUDITORIA-HAG-Supply-PaginasLegales-veredicto.md` (GO técnico; pendiente para publicar como completo).
**Estado:** sin commit.

## Qué se pide en esta ronda

GO para **desplegar** las páginas mientras la tienda sigue en Stripe **modo test**. No se pide declararlas "completas para live". Los puntos que dependen de funcionalidad u operación quedan listados como requisitos previos a live (sección 3), con su procedimiento interino documentado.

## 1. Cambios respecto de v1

| Hallazgo del veredicto | Cambio |
|---|---|
| §1 Contacto postal | Sin cambio de criterio. Se publica solo la **ubicación** ("based in Delray Beach, FL 33484, USA", sección Company), sin el rótulo "Mailing address". Esa sección sigue oculta mientras `mailingAddress = null`. La dirección de devolución se entrega por email (Returns, paso 2). |
| §2 Plazo de despacho no cumplido | Shipping: nueva sección **"If we can't ship on time"**. Aviso por email antes de que venza el plazo, con nueva fecha estimada y opción de cancelar con reembolso total y pronto. Si no se puede despachar, cancelación y reembolso total. Procedimiento en `OPERACION-HAG-Supply.md` §1–2. |
| §3 Cancelación antes del envío | Returns: "We will stop the order, confirm the cancellation by email and issue the refund within 2 business days". Procedimiento interino en `OPERACION` §3, con la **limitación declarada**: un reembolso manual en Stripe no cambia el estado del pedido ni repone stock (el webhook ignora refunds sin `metadata.orderId`, `lib/stripe-webhook.ts:103`). La acción de admin "Cancelar y reembolsar" queda como **requisito antes de live**. |
| §3 Corrección de dirección | Procedimiento en `OPERACION` §4. |
| §3 Plazo de reembolso | Returns: el reembolso se emite **dentro de 3 días hábiles desde la aprobación**; después corren los 5–10 días hábiles del banco. |
| §3 Ventana de 7 días | Returns: "please contact us within 7 days … so we can resolve it quickly … This timeframe does not limit any rights you have under applicable law." |
| §3 Email de despacho | `lib/email-templates.ts`: la confirmación ya no dice "We'll email you again when it ships". Ahora dice "You can follow the status of your order in your account." El aviso de despacho queda como mejora antes de live. |
| §4 Inventario de proveedores | Privacy: se agregan **Cloudflare y Google (Gmail)** para recibir y responder emails y para los avisos internos de pedidos. |
| §4 Retención y derechos | Privacy: los registros de pedidos y sus emails se conservan lo necesario. Copias en respaldos cifrados hasta su reemplazo. Solicitudes desde el email de la cuenta (verificación) y respuesta en **30 días**. Se informa si hay que conservar algo. Procedimiento en `OPERACION` §6. |
| §5 D.C. | `STORE_INFO.shipping.area` = "all 50 U.S. states and Washington, D.C." (coincide con `US_STATES`, que incluye DC). |
| §5 Textos fuera de `STORE_INFO` | `responseTime`, `damageReportDays`, `refundIssueDays`, `cancelRefundDays` y `delayNoticeBy` pasan a `STORE_INFO`. "Free shipping" sigue en Shipping y en el footer porque refleja el código (`shippingCost: 0`); si cambia, se cambian ahí. |

Nuevo: **`OPERACION-HAG-Supply.md`** con los procedimientos que respaldan cada promesa (revisión diaria, retrasos, cancelación, dirección, devoluciones, privacidad) y la lista de requisitos antes de live. Responsable: el dueño.

## 2. Pruebas

`npx tsc --noEmit` OK. `npx next build` OK: las 5 rutas siguen estáticas. Los cambios son de texto y constantes; la estructura ya se verificó en navegador en v1.

## 3. Requisitos antes de cobros reales (no forman parte de este GO)

1. Acción de admin **Cancelar y reembolsar** para pedidos pagados y no despachados: refund en Stripe con `metadata.orderId`, estado cancelado y reembolsado, reposición de stock y registro. Opcional: email de despacho al marcar SHIPPED.
2. Dirección postal comercial para devoluciones.
3. Revisión legal de Terms y Privacy. Que el contador confirme sales tax.
4. Activación de Stripe live, claves live y webhook live con su propio secreto.
