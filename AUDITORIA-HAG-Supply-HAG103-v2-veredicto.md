# Reauditoría HAG-103 v2 — veredicto

Fecha: 2026-10-15. Alcance: solicitud v2, diff contra `f6cc9ee`, implementación actual, migración y nuevas pruebas.

**GO técnico para desplegar en modo test. Los dos hallazgos mayores de v1 quedan resueltos.** La aceptación operativa requiere probar el despliegue; este GO no habilita cobros reales. HAG-121 y HAG-122 siguen siendo requisitos previos a live.

## 1. Persistencia de avisos — RESUELTO

`notifyAdmin` propaga el fallo de `enqueueAdminAlert`. La entrega posterior sigue gestionada por la outbox, sin confundir un error del proveedor con la ausencia de un registro durable.

Comprobación independiente sobre el POST real, firmado localmente, con almacenamiento simulado:

- Primera escritura falla: HTTP **500**, ninguna fila persistida.
- Reenvío: HTTP **200**, una fila.
- Evento duplicado: HTTP **200**, sigue habiendo una sola fila.

La rama `requires_action` ahora encola dentro de una transacción y también propaga los errores de escritura. Las pruebas aportadas incluyen este caso.

## 2. Propiedad del lock — RESUELTO

Cada reclamo genera un UUID en `claimToken`. Las tres escrituras finales exigen `id`, estado `SENDING` y el token propio. Una ejecución reemplazada obtiene cero filas y retorna `skipped`; no libera el lock ajeno ni modifica intentos o resultados de otra ejecución.

Se verificaron independientemente estas secuencias con `deliverEmail` real y almacenamiento simulado:

| Secuencia | Resultado |
| --- | --- |
| A expira, B envía, A termina con error | Conserva `SENT` y el ID del proveedor de B |
| A expira, B reclama, A termina con éxito | Conserva `SENDING` y el token de B; B completa después |
| A expira, B envía, A termina con `not_configured` | Conserva `SENT`, sin descontar intentos |
| Proveedor nunca responde | Timeout, `retry`, fila `PENDING`, token liberado |

La columna está presente tanto en el schema como en el SQL. La modificación de la migración todavía no aplicada a producción es coherente con el estado declarado en la solicitud; esa situación no se verificó contra producción.

## 3. Observaciones anteriores

- **`requires_action`: resuelta la condición de aplicabilidad.** El UPDATE condicionado comprueba estado e identidad dentro de la misma transacción que crea el aviso. La clave única conserva la deduplicación. Se revisaron los casos aportados de orden terminal, otro refund y error de encolado.
- **Visita a confirmación:** `reconcileOrderPayment` ahora reintenta la entrega cuando encuentra un estado pagado. La descripción v2 acota correctamente los mecanismos de reintento.
- **Envío con timeout y presupuesto:** mejora aceptada para modo test, con las precisiones siguientes.
- **Outbox agotada y recuperación operativa:** sigue pendiente en HAG-121, antes de live.
- **Frecuencia, monitoreo y capacidad del ejecutor:** sigue pendiente en HAG-122, antes de live. No se verificaron esos tickets desde Linear.

## 4. Precisiones no bloqueantes para este GO test

`budgetMs` limita el inicio de nuevas entregas, no la duración total. Un lote con presupuesto de 5 segundos puede esperar hasta el timeout de 15 segundos de una entrega iniciada antes de vencer; el handler puede ejecutar además un lote previo para la orden. Las operaciones de base de datos tampoco están limitadas por ese presupuesto. No interpretar el valor como un máximo de 5 segundos para responder a Stripe. HAG-122 debe contemplar un presupuesto global y el límite real del runtime, también para el cron de hasta 50 entregas.

`withTimeout` usa `Promise.race`: corta la espera de la aplicación, pero no cancela la petición al proveedor. Un timeout deja incierto si Resend aceptó el envío. Mantener la misma clave y el mismo contenido al reintentar; la deduplicación del proveedor tiene una ventana de 24 horas, por lo que la garantía no es de entrega exactamente una vez sin límite temporal. [Documentación de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

La tolerancia de un segundo solo afecta `nextAttemptAt`, no los locks. Puede adelantar un reintento hasta un segundo respecto de su fecha programada; no elimina el backoff. Resulta aceptable para este uso.

## 5. Evidencia y alcance

- `node node_modules/tsx/dist/cli.mjs scripts/audit-hag103-v2.ts`: verificaciones anteriores OK. El script usa el POST y las funciones reales con dobles de almacenamiento/proveedor; no conecta a PostgreSQL, Stripe ni Resend y no envía emails.
- `npx tsc --noEmit --incremental false`: OK, incluido el script nuevo.
- Las **73/73 pruebas con PostgreSQL, build y verificación del Reply-To** son evidencia aportada; no se reejecutaron ni verificaron externamente en esta revisión. Se inspeccionó el código de las nuevas pruebas de aceptación.
- `scripts/audit-hag103.ts` queda como reproducción histórica de v1, con expectativas del defecto anterior. No debe usarse como criterio de éxito para v2.

Después del respaldo, aplicar y verificar la migración con `claimToken` antes de desplegar el código nuevo. Configurar las variables y comprobar una compra test con email recibido, fila `SENT` e ID de proveedor; comprobar también autenticación/ejecución del cron. Registrar esa evidencia para la aceptación operativa.

Solo se agregaron este informe y el script de verificación v2. No se modificó código funcional, no se ejecutaron migraciones, no se desplegó y no se enviaron mensajes.
