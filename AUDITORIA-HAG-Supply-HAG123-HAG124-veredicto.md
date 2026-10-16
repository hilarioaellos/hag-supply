# Auditoría HAG-123 / HAG-124 — veredicto

Fecha: 2026-10-16. Alcance: solicitud, diff contra `f520e86`, archivos actuales, migración y pruebas de integración aportadas.

**GO técnico para desplegar en modo test. Sin hallazgos bloqueantes en ese alcance.** La recepción real del aviso de venta y el aislamiento observado desde producción siguen pendientes de la verificación posterior al despliegue. Este GO no habilita cobros reales.

## HAG-123 — APROBADO técnicamente

`confirmOrder` llama a `enqueueOrderEmails` dentro de la transacción que confirma la orden, descuenta stock y vacía el carrito. Una única operación `createMany` registra ambos mensajes con claves de deduplicación diferentes. El aviso tiene tipo `ADMIN_NEW_ORDER`, por lo que no altera el conteo de incidentes `ADMIN_ALERT`.

La precedencia de destinatarios es correcta: `ORDER_NOTIFY_EMAIL`, luego `ADMIN_ALERT_EMAIL`, luego el destinatario por defecto. El destinatario queda capturado al encolar, igual que el contenido. La nueva plantilla incluye datos de compra, comprador, dirección y enlace al admin; se comprobó el escape de nombres de producto y comprador, además de la versión texto.

La entrega conserva el mecanismo de reclamo y token aprobado en HAG-103. El límite de tres permite intentar los dos emails de una orden normal, pero el presupuesto temporal puede dejar el segundo para un barrido posterior. No interpretar el encolado conjunto como entrega simultánea garantizada.

La migración es aditiva y coincide con el enum del schema. Aplicar y confirmar el nuevo valor antes de desplegar código que lo escribe.

## HAG-124 — APROBADO para la cuenta compartida en modo test

La marca se escribe desde el servidor al crear el PaymentIntent. El webhook primero busca la orden por `stripePaymentIntentId`; el filtro de origen solo interviene cuando no hay orden. Los eventos asociados mantienen su tratamiento anterior.

Se verificaron independientemente, con el handler real y el POST firmado:

| Caso | Resultado |
| --- | --- |
| Huérfano de `localhost:3000` en instalación de producción simulada | `ignored:foreign_origin`, HTTP 200, sin aviso |
| Huérfano del propio host | `orphan_payment`, HTTP 200, un aviso durable |
| Huérfano sin marca, compatible con pagos antiguos | `orphan_payment`, HTTP 200, un aviso durable |
| PaymentIntent ya asociado, aunque tenga marca ajena | Se procesa por la orden; en el caso terminal probado, `skipped:PAYMENT_CONFIRMED` |
| Repetición de los eventos | No duplica los avisos |

Se inspeccionaron los puntos de creación de PaymentIntents en la suite: los pagos reales pasan por `startCheckout` y su wrapper de creación delega con los mismos argumentos. Los helpers de oversell con IDs ficticios no crean pagos reales. La configuración local actual declara `NEXTAUTH_URL=http://localhost:3000`, distinta del host de producción informado.

## Precauciones de alcance y condiciones para live

1. **El filtro no está limitado a test en el código.** `lib/stripe-webhook.ts:53` compara el origen sin consultar `event.livemode`. Que en live haya claves y destinos separados no lo desactiva. Antes de live, condicionar esta excepción al entorno de prueba o definir una política explícita que no silencie un pago live huérfano por una marca distinta o antigua. Añadir una prueba con evento live y origen ajeno.
2. **`NEXTAUTH_URL` debe ser explícito y diferente en cada instalación que comparta Stripe test.** Si falta, `appOrigin()` usa el host de producción; una suite sin esa variable volvería a parecer del mismo origen y generaría avisos. Si es inválida, la función retorna la cadena sin validar. Conviene que la suite aborte antes de crear pagos si no tiene un origen de prueba válido y distinto de producción. `TEST_ONLY` es un filtro por nombre, no una garantía de aislamiento.
3. **La marca no es separación de cuentas.** Los eventos siguen llegando y los PaymentIntents antiguos sin marca pueden seguir avisando. El cambio no etiqueta retroactivamente eventos ya creados ni pendientes. Al comprobar el contador, distinguir eventos nuevos de entregas antiguas.
4. **Capacidad de emails:** ahora se encolan dos mensajes por venta. Mantener HAG-121 y HAG-122 como requisitos de recuperación y operación previos a live, dimensionados para ese volumen.

## Evidencia independiente y límites

- `node node_modules/tsx/dist/cli.mjs scripts/audit-hag123-hag124.ts`: OK. Usa funciones reales, POST firmado y almacenamiento simulado; no conecta a PostgreSQL, Stripe ni Resend y no envía emails.
- La verificación de HAG-123 cubrió dos filas, tipos y claves distintos, deduplicación, tres opciones de destinatario, contenido y HTML escapado. La atomicidad y el rollback se evaluaron por inspección del flujo transaccional; no se simularon como prueba de PostgreSQL.
- `npx tsc --noEmit --incremental false`: OK, incluido el script nuevo.
- Las corridas **77/77** previas y **33/33** parciales posteriores, el build y el contador de producción son evidencia aportada. No se reejecutaron ni verificaron contra servicios externos aquí.
- No se ejecutó la suite completa: trunca la base configurada y confirma pagos en la cuenta Stripe compartida. Su ejecución corresponde a la verificación posterior a desplegar el filtro, con base desechable y origen local comprobado.

Para la aceptación operativa, verificar tras el despliegue: suite completa sin nuevos avisos falsos atribuibles a sus pagos; compra test con ambos emails recibidos; filas `SENT` con IDs de proveedor; destinatario real del aviso de venta correcto. La aceptación de Resend por sí sola no acredita recepción en Gmail, que la solicitud declara todavía pendiente.

Solo se agregaron este informe y el script aislado. No se modificó código funcional, no se ejecutaron migraciones, no se desplegó y no se enviaron mensajes.
