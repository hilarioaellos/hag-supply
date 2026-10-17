# Reauditoría — Cancelar y reembolsar v3

Fecha: 2026-10-16. Alcance: informe v3, diff completo contra `d96b11a`, diferencias respecto de v2 y código actual de estados, refunds y bandeja de emails.

**GO técnico para este cambio. Se levantan los bloqueantes de v1 y v2; no se encontraron nuevos bloqueantes en el alcance revisado.** El flujo de cancelar/reembolsar puede darse por aprobado técnicamente. Esto no aprueba por sí solo habilitar Stripe live ni sustituye los requisitos generales pendientes de la tienda.

## Correcciones aceptadas

1. **Notificación por refund concreto.** `enqueueRefundIssuedEmail` recibe el ID del refund y usa `order-refunded:{orderId}:{refundId}`. Tanto el resultado automático exitoso como el cierre manual pasan el ID correcto. Un refund de reemplazo genera otro aviso; repetir el mismo hecho no genera duplicados.
2. **Anulación ante fallo tardío.** `applyRefundOutcome` anula los avisos `PENDING`/`FAILED` de ese refund dentro de la misma transacción que registra `CANCEL_REFUND_FAILED` y encola la alerta. Un aviso anulado deja de ser elegible para Retry.
3. **Vigencia antes de enviar.** `staleReason` exige `CANCELLED_REFUNDED` y que el refund del aviso siga siendo el guardado en el pedido. Un reclamo vencido de un aviso de refund fallido o reemplazado queda `CANCELLED`, sin llamar al proveedor y sin gastar otro intento.
4. **Errores de Stripe.** El cierre manual distingue recurso inexistente (422) de error de consulta (502); ninguno altera el pedido. El aviso al admin describe el email de cancelación como encolado y dirige al registro del refund manual.
5. **Correcciones anteriores conservadas.** Sigue presente el UPDATE de estados condicionado al estado leído y a `cancelledAt: null`, la cancelación mantiene el reclamo atómico y las confirmaciones pendientes o retomadas de pedidos cancelados se anulan. La plantilla de cancelación ya no afirma que el refund fue emitido.

## Comprobación independiente

`node scripts/audit-cancel-refund-v3.cjs`: **OK**. Ejecuta los módulos actuales con adaptadores en memoria, sin conexiones externas.

Se comprobaron las secuencias de refund A exitoso → fallo tardío de A → cierre manual con B → entrega y deduplicación, partiendo del aviso de A en cada estado:

| Aviso de A antes del fallo | Resultado comprobado |
|---|---|
| `PENDING` | Se anula; no se envía; B genera y entrega su propio aviso |
| `FAILED` | Se anula; Retry no lo revive; B genera y entrega su propio aviso |
| `SENDING` | No se pisa el reclamo vigente; al vencer y retomarlo se anula sin envío ni consumo adicional de intento; B se entrega |
| `SENT` | Se conserva el registro histórico; B genera y entrega un aviso distinto |

En todos los casos, repetir el cierre de B devuelve 409, reaplicar el resultado exitoso no cambia la orden y repetir el encolado de B no agrega filas. También se verificaron los rechazos de escrituras obsoletas a `SHIPPED`/`PROCESSING`, la plantilla de cancelación y la anulación de confirmaciones con backoff o reclamo vencido.

`npx tsc --noEmit --incremental false`: **OK**.

## Límites de la aprobación y despliegue

- Las **116/116 pruebas contra PostgreSQL y Stripe test**, el build y la inspección visual son evidencia aportada en el informe. No se reejecutaron en esta ronda. Las verificaciones independientes en memoria no sustituyen la prueba de bloqueos de PostgreSQL.
- Un mensaje ya aceptado por el proveedor no puede retirarse. La comprobación de vigencia reduce los avisos obsoletos pendientes o retomados; no garantiza atomicidad entre la lectura del pedido, un cambio posterior y la entrega externa.
- Se mantiene la recuperación manual documentada para una cancelación detenida antes de crear el refund: revisar el dashboard y pulsar Retry. El cron de emails no crea refunds.
- Según el informe, ninguna versión de esta migración se aplicó en producción. Bajo esa premisa, aplicar la migración completa antes de publicar el código, con el respaldo y verificación propuestos, es consistente con los enums y campos usados. No se ejecutaron respaldo, migración, commit, push ni despliegue en esta auditoría.
- Verificar tras publicar que las dos rutas admin rechacen peticiones sin sesión con 401. El enlace fijo al dashboard Stripe test y los demás requisitos de operación live siguen siendo trabajo previo a cobros reales.

Se agregaron únicamente este veredicto y `scripts/audit-cancel-refund-v3.cjs`. No se modificó código funcional, no se cargaron secretos para las reproducciones, no se enviaron emails ni se accedió a bases de datos.
