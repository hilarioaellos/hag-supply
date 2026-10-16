# Auditoría HAG-103 — veredicto

Fecha: 2026-10-15. Alcance: solicitud HAG-103, diff contra `f6cc9ee`, archivos actuales, integración con checkout/webhook y pruebas aportadas.

**NO-GO para cerrar HAG-103: dos hallazgos mayores reproducidos.** El diseño transaccional resuelve la pérdida de confirmaciones al hacer commit y preserva los avisos de refund fallido. Falta asegurar la persistencia de otros avisos y la propiedad del lock de entrega.

## 1. MAYOR — Se pierde el aviso de un pago huérfano si falla su escritura

Ubicación: `lib/order-emails.ts:204`, especialmente el catch de la línea 211. Llamador: `lib/stripe-webhook.ts`, caso de pago sin orden.

`notifyAdmin` captura tanto errores de entrega como errores de **encolado**. Si `enqueueAdminAlert` falla por un problema transitorio de base de datos, solo escribe un log y resuelve normalmente. El handler devuelve `orphan_payment` y la ruta responde 200. No existe fila en `EmailOutbox` para que el cron o futuras entregas la recuperen.

Reproducción independiente con POST real y firma válida:

1. La búsqueda del PaymentIntent no encuentra orden.
2. `emailOutbox.createMany` lanza un fallo transitorio de escritura.
3. El webhook responde **200**, sin aviso durable. El error solo queda en consola.

También afecta al aviso `requires_action`, que usa la misma función.

**Corrección requerida:** distinguir persistencia y entrega. Un fallo antes de registrar durablemente el aviso debe propagarse al webhook para obtener 5xx y reintento; una vez encolado, un error del proveedor puede quedar gestionado por la outbox sin romper el pago. Mantener el 200 para pagos huérfanos cuando el aviso se haya persistido o ya exista por deduplicación.

**Prueba de aceptación:** provocar un fallo transitorio de `createMany`, comprobar HTTP 500 y ausencia de fila; reenviar el evento, comprobar una fila y 200. Cubrir también `requires_action`. No hay que enviar emails reales para probarlo.

## 2. MAYOR — Un propietario antiguo del lock puede sobrescribir el resultado del nuevo

Ubicación: `lib/order-emails.ts:137`, `:146` y `:155`.

El reclamo inicial es atómico, pero las escrituras finales usan únicamente `where: { id }`. No verifican que la ejecución siga siendo dueña del reclamo. Un lock vencido permite que otra ejecución tome la fila mientras la anterior todavía espera al proveedor.

Secuencia reproducida con `deliverEmail` real:

1. A reclama la fila y queda esperando al proveedor.
2. Vence su lock de dos minutos. En la prueba se fuerza esa expiración, sin esperar dos minutos reales.
3. B retoma la fila, envía correctamente y persiste `SENT` con `providerMessageId`.
4. A recibe un error tardío y escribe `PENDING` usando solo el ID.
5. Resultado: **`PENDING` con el `providerMessageId` del envío exitoso de B**. Vuelve a ser elegible para envío.

No requiere que B falle ni que haya errores de PostgreSQL. La prueba existente de lock vencido cubre un proceso caído que nunca vuelve; no cubre un propietario antiguo todavía activo.

**Corrección requerida:** guardar un token único de reclamo y condicionar todas las escrituras de éxito, error y proveedor ausente a `id + status SENDING + token`. Si el reclamo ya no pertenece a esa ejecución, no debe modificar la fila. Además, limitar el tiempo de envío y contemplar renovación del lock si se permiten operaciones más largas; no basta con aumentar sus dos minutos.

**Pruebas de aceptación:** A expira, B envía y A termina con error → conservar `SENT`; A expira, B reclama y A termina con éxito → A no libera ni sobrescribe el reclamo de B. Verificar también la rama `not_configured`.

Resend limita su deduplicación a **24 horas**. Por tanto, su clave idempotente reduce duplicados, pero no corrige el estado local ni garantiza evitar un reenvío después de esa ventana. [Documentación oficial de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

## 3. Observaciones adicionales

- **`requires_action`: deduplicado, pero todavía sin condición de estado/identidad.** `lib/oversell.ts:105` encola directamente. Una respuesta atrasada puede generar el primer aviso después de resolverse la orden; un refund distinto también puede generar un aviso para esa orden. La observación anterior queda parcialmente atendida. Conviene comprobar atómicamente que sigue pendiente y corresponde al refund antes de crear el aviso, además de conservar la dedupeKey.
- **Aislamiento temporal del webhook:** `await deliverPending` y los envíos dentro del handler siguen retrasando el 200. Capturar excepciones no protege frente a una espera larga ni al límite de ejecución de Vercel. Definir un timeout del proveedor y un presupuesto de trabajo, o delegar la entrega a un ejecutor durable. El código no debe afirmar que el envío no afecta a la respuesta en términos de tiempo.
- **Reintentos desde visitas:** `reconcileOrderPayment` sale inmediatamente cuando la orden ya está confirmada, sin llamar a la entrega. `already_processed` tampoco la dispara en todos los llamadores. La afirmación de que toda nueva llamada/visita reintenta el email es demasiado amplia; el cron y el barrido global del webhook sí constituyen reintentos independientes.
- **Agotamiento:** `FAILED` conserva el registro y el error, pero no encontré una vista de outbox ni recuperación de esos emails en el admin. Antes de live, definir cómo se detectan y reencolan de forma controlada los agotados; los logs del proveedor no sustituyen ese procedimiento.

## 4. Respuestas a los puntos de revisión

1. **Cron diario:** aceptable para pruebas con demoras documentadas. Para live, no lo considero suficiente como único respaldo de avisos operativos de dinero cobrado sin orden o reembolsos fallidos. La ejecución Hobby tiene precisión por hora; el lote de 50 tampoco garantiza vaciar un backlog en una sola ejecución. Se necesita una frecuencia de recuperación acorde con la atención operativa, monitoreo y capacidad de drenaje definida. [Límites oficiales de Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).
2. **Render al encolar:** aprobado. Captura los datos de la orden dentro de la transacción y evita depender de cambios posteriores de productos para preparar el envío. El escape de HTML está aplicado a los textos y atributos dinámicos inspeccionados.
3. **Un aviso por refund que requiere acción:** la clave única cubre duplicados. Falta la condición de aplicabilidad señalada arriba. La ausencia de alertas por pendientes prolongados puede mantenerse como limitación explícita, con seguimiento operativo.
4. **Sending access / All domains:** aceptable para esta cuenta según el alcance declarado; no bloquea esta auditoría. No se verificaron los permisos de la cuenta desde un conector ni el dominio en esta revisión.

La migración es aditiva y debe aplicarse antes de ejecutar el código nuevo, como indica la solicitud. No se ejecutó aquí.

## 5. Evidencia y límites

- `node node_modules/tsx/dist/cli.mjs scripts/audit-hag103.ts`: ambos defectos reproducidos. Ejecuta el código real con almacenamiento y proveedor simulados, incluyendo el POST firmado. No conecta a PostgreSQL, Stripe ni Resend y no envía mensajes.
- `npx tsc --noEmit --incremental false`: OK, incluido el script nuevo.
- Se revisaron las pruebas nuevas. Cubren rollback, deduplicación, reclamos simultáneos y recuperación de un proceso caído, pero no las dos secuencias anteriores.
- **63/63 pruebas, build y recepción en Gmail:** evidencia aportada por la solicitud, no reejecutada ni verificada externamente aquí. La suite de integración trunca la base configurada; no se utilizó una base existente.
- Solo se agregaron este informe y el script de reproducción. No se modificó código funcional, no se migró ni desplegó y no se enviaron emails.
