# Reauditoría HAG-95 v2 — veredicto

Fecha: 2026-10-15.
Alcance: `AUDITORIA-HAG-Supply-HAG95-v2.md`, su diff contra `4df84bf`, los archivos actuales y las nuevas pruebas de concurrencia.

**GO técnico para desplegar en modo test. El hallazgo mayor de v1 queda resuelto.** La aceptación operativa sigue pendiente de verificar el webhook desplegado; este GO no habilita cobros reales.

## Hallazgo anterior — RESUELTO

`lib/oversell.ts:71` centraliza la aplicación del resultado en `applyRefundOutcome`. El fallo actualiza atómicamente tanto `OVERSELL_REFUND_PENDING` como `CANCELLED_REFUNDED`, condicionado a la identidad del refund. El éxito únicamente puede actualizar una orden pendiente: no revierte `OVERSELL_REFUND_FAILED`. El aviso de fallo depende de `count === 1`.

`lib/stripe-webhook.ts:80` ya no selecciona la transición basándose en un estado leído antes de otra operación asíncrona. Resuelve la orden, consulta el refund vigente y aplica la misma transición. Así también cubre el cambio de estado entre la lectura del handler y la antigua entrada al flujo de oversell.

La búsqueda prioriza el `stripeRefundId` guardado antes de usar metadata. Los predicados de las transiciones terminales impiden aplicar el resultado de otro refund cuando la orden ya tiene uno asociado.

## Verificación independiente

Se agregó `scripts/audit-hag95-v2.ts`, que ejecuta los handlers reales con dobles de almacenamiento y Stripe. El almacenamiento simula lecturas por snapshot y actualizaciones condicionadas atómicas, incluyendo los `OR` anidados de v2. No conecta a PostgreSQL ni a Stripe.

Comando: `node node_modules/tsx/dist/cli.mjs scripts/audit-hag95-v2.ts`.

`npx tsc --noEmit --incremental false`: OK, incluido el script nuevo.

| Caso | Resultado |
| --- | --- |
| `refund.updated` succeeded antes de `refund.failed` | Final `OVERSELL_REFUND_FAILED`, un aviso |
| Mismos actores, failed antes del succeeded atrasado | Final `OVERSELL_REFUND_FAILED`, un aviso |
| `payment_intent.succeeded` por `handleOversell` antes de `refund.failed` | Final `OVERSELL_REFUND_FAILED`, un aviso |
| Mismos actores por oversell, orden inverso | Final `OVERSELL_REFUND_FAILED`, un aviso |
| Dos fallos concurrentes del mismo refund | Una transición efectiva, un aviso |
| Otro refund, tanto succeeded como failed | `SKIPPED`, orden intacta |

Los clientes de estas carreras fallan si se intenta listar o crear otro refund; ninguna ejecución lo intentó.

También se revisaron las cinco pruebas nuevas de `scripts/test-checkout.ts`: usan la base configurada y compuertas en las consultas de Stripe para forzar los intervalos. Cubren la secuencia original, el orden inverso, el camino compartido, el duplicado concurrente y la prioridad de la asociación guardada sobre metadata.

Las **50/50 pruebas con PostgreSQL y el build** son evidencia aportada por la solicitud; no se reejecutaron en esta revisión. La comprobación independiente aislada complementa esa evidencia y no equivale a ejecutar PostgreSQL real.

El script `scripts/audit-hag95-race.ts` de v1 queda como reproducción histórica: su comparador simple y sus expectativas del defecto anterior no son un criterio válido para v2.

## Observación menor

`requires_action` todavía emite un aviso en cada llamada, sin condicionar por estado ni deduplicar. Con la nueva llamada directa desde eventos de refund, una entrega duplicada o una respuesta atrasada puede repetir ese aviso incluso después de resolver la orden. No modifica el estado terminal ni reintroduce el hallazgo mayor. Conviene condicionar y deduplicar este aviso al implementar HAG-103. La garantía de un solo aviso validada arriba corresponde a la transición `failed/canceled`.

## Alcance del GO

- Se mantiene aprobado: firma sobre cuerpo crudo, secreto ausente → 500, errores transitorios → reintento y pago huérfano → revisión manual sin devolución automática.
- Se puede proceder al despliegue **test**, crear el destino snapshot con los tres eventos indicados y configurar su signing secret.
- Para aceptar la operación desplegada: comprobar una compra de prueba sin regreso a la confirmación, orden `PAYMENT_CONFIRMED` y entrega 200 en Stripe. Registrar evidencia y limpiar los datos de prueba.
- Para live siguen pendientes HAG-103 con envío durable, avisos operativos verificables, claves live, destino live con su propio secreto y verificación en ese entorno. Las limitaciones de reintentos de sandbox y el formato snapshot quedaron recogidos en v2.

Esta revisión no cambia código funcional, no despliega y no configura Stripe o Vercel.
