# Auditoría HAG-95 — veredicto

Fecha: 2026-10-15. Alcance: `AUDITORIA-HAG-Supply-HAG95-cambios.diff`, contrastado con los archivos actuales y los flujos compartidos de checkout, confirmación y oversell.

**Veredicto: NO-GO para cerrar HAG-95.** Un hallazgo mayor reproducido: puede perderse un fallo de reembolso bajo concurrencia. Se puede seguir trabajando en modo test; este resultado no habilita cobros reales.

## 1. MAYOR — Se reconoce un refund fallido sin persistir su fallo

Ubicación principal: `lib/stripe-webhook.ts:88`. Relacionado: `lib/oversell.ts:104`.

`onRefundChanged` decide qué camino tomar con una lectura previa del estado. Si lee `OVERSELL_REFUND_PENDING`, retorna directamente desde `oversell`, sin volver a ejecutar la regla de fallo posterior a éxito. Dentro de ese flujo, `markFailed` únicamente actualiza órdenes que todavía están pendientes; si otro actor ya las cambió a `CANCELLED_REFUNDED`, retorna `SKIPPED`.

Secuencia reproducida con el handler real y dobles de PostgreSQL/Stripe:

1. A procesa `refund.updated`. Lee la orden pendiente y obtiene una respuesta de Stripe con el refund `succeeded`; se pausa antes de aplicar ese resultado.
2. B procesa `refund.failed` para **el mismo refund**. También lee la orden pendiente y obtiene el refund `failed`.
3. A persiste `CANCELLED_REFUNDED`.
4. B intenta `markFailed`: el predicado `status: OVERSELL_REFUND_PENDING` ya no coincide y modifica cero filas.
5. B retorna `oversell:SKIPPED`. No lanza, por lo que la ruta respondería 200; la orden sigue `CANCELLED_REFUNDED` y no se activa el aviso al admin.

Resultado observado:

```json
{
  "successOutcome": { "action": "oversell:CANCELLED_REFUNDED", "orderId": "audit-order" },
  "failureOutcome": { "action": "oversell:SKIPPED", "orderId": "audit-order" },
  "finalStatus": "CANCELLED_REFUNDED"
}
```

Impacto: se presenta como reembolsada una orden cuyo refund falló. La alerta del dashboard basada en `OVERSELL_REFUND_FAILED` tampoco aparece. No hay garantía de que llegue otro evento para repararlo.

Es una concurrencia válida: la respuesta `succeeded` de A puede estar en vuelo cuando Stripe cambia el refund a `failed` y entrega B. Stripe documenta tanto [entregas duplicadas y sin orden garantizado](https://docs.stripe.com/webhooks#event-delivery-behaviors) como [reembolsos fallidos y la necesidad de devolver el dinero por otra vía](https://docs.stripe.com/refunds#handle-failed-refunds).

Corrección requerida: asegurar que un fallo del mismo refund pueda persistirse tanto desde `OVERSELL_REFUND_PENDING` como desde `CANCELLED_REFUNDED`, con condiciones atómicas de identidad y estado. El camino pendiente no debe salir con `SKIPPED` sin comprobar si perdió precisamente esta carrera. También hay que cubrir el cambio de estado entre la lectura del handler y la entrada a `handleOversell`. Mantener el aviso condicionado a una sola transición efectiva.

Validación para levantar el bloqueante: prueba concurrente con PostgreSQL desechable y Stripe controlado que fuerce ambos intervalos, termine en `OVERSELL_REFUND_FAILED`, emita un solo aviso y no cree otro refund. Incluir también el orden inverso, para demostrar que una respuesta atrasada `succeeded` no revierte el fallo.

## 2. Respuestas a los puntos de revisión

- **`CANCELLED_REFUNDED → OVERSELL_REFUND_FAILED`: aprobado como regla de negocio**, para el mismo refund fallido/cancelado. Corrige una condición documentada por Stripe. Su implementación tiene la carrera anterior.
- **Pago huérfano → 200 y revisión manual:** aceptable en el alcance test y con el contrato actual del checkout, que asocia el PaymentIntent antes de entregar el client secret. La notificación hoy es solo un log; antes de live debe existir un aviso operativo verificable. No se justifica reembolsar automáticamente una asociación desconocida.
- **Falta de `STRIPE_WEBHOOK_SECRET` → 500:** correcto para solicitar reintento. La documentación de entrega debe distinguir entornos: Stripe indica hasta tres días en live y tres reintentos durante unas horas en sandbox. No asumir días de recuperación automática para estas pruebas. [Fuente oficial](https://docs.stripe.com/webhooks#automatic-retries).
- **Habilitar cobros reales:** además de claves live y HAG-103, resolver este bloqueante, configurar un destino live independiente con su propio signing secret, verificar la entrega y la confirmación sin regreso del comprador, y comprobar atención de fallos/huérfanos. El código espera eventos **snapshot** con `data.object`; configurar el destino con ese formato y una versión compatible con el SDK. La configuración del destino determina el formato y versión del evento. [Fuente oficial](https://docs.stripe.com/webhooks#create-an-event-destination).

Al implementar HAG-103, cubrir la entrega durable de emails: hoy el cambio de estado se confirma antes del envío. Si el envío falla, el siguiente intento sale por estado terminal y no vuelve a enviarlo. No es un segundo bloqueante de este alcance, porque los emails actuales son stubs; sí es un criterio de aceptación para HAG-103.

## 3. Evidencia obtenida en esta revisión

- Lectura de las guías locales de Next.js 16 para Route Handlers. La ruta POST con cuerpo crudo es compatible con la API documentada; el matcher de `proxy.ts` deja fuera `/api/webhooks/stripe`.
- `node node_modules/tsx/dist/cli.mjs scripts/audit-hag95-race.ts`: seis comprobaciones sobre la ruta real pasaron: firma ausente, inválida, otro secreto y cuerpo alterado → 400; firma válida con evento ignorado → 200; secreto ausente → 500.
- `npx tsc --noEmit --incremental false`: OK, incluido el script de reproducción.
- El mismo script reproduce la carrera descrita. Usa los handlers reales y simula lecturas por snapshot y actualizaciones condicionadas atómicas. **No conecta a PostgreSQL ni a Stripe.** No sustituye una prueba concurrente contra PostgreSQL.
- La prueba existente de fallo posterior a éxito (`scripts/test-checkout.ts:750`) es secuencial; empieza con `CANCELLED_REFUNDED`, por lo que no cubre este intervalo.
- Las 45/45 pruebas y el build figuran como evidencia aportada en la solicitud. No se reejecutaron aquí: la suite trunca la base indicada y requiere PostgreSQL local desechable y Stripe test. No se utilizó ninguna base existente.

No se modificó el código funcional ni se realizó despliegue. Se agregaron este informe y el script de reproducción.
