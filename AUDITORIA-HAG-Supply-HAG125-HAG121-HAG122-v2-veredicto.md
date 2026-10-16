# Reauditoría HAG-125 / HAG-121 / HAG-122 v2 — veredicto

Fecha: 2026-10-16. Alcance: solicitud v2, diff contra `e5d1a95`, código actual, script del programador y pruebas aportadas.

**GO técnico para desplegar el conjunto. El hallazgo mayor de HAG-122 queda resuelto.** Se mantienen los GO técnicos de HAG-125 y HAG-121. La aceptación operativa de HAG-122 sigue pendiente de aplicar y verificar el programador; este veredicto no autoriza por sí solo activar cobros reales.

## Hallazgo anterior — RESUELTO

`withEmailDeadline` fija un deadline absoluto en `AsyncLocalStorage`. Tanto el trabajo anidado del handler como el barrido global lo respetan; un contexto anidado toma el mínimo y no amplía la ventana exterior.

`deliverPending` pasa el deadline efectivo a cada entrega. `deliverEmail` limita el timeout al tiempo restante, evita reclamar sin una ventana mínima y vuelve a comprobarla después de las operaciones de almacenamiento. Si ya no cabe el envío, libera únicamente su propio reclamo, devuelve el intento y retorna `deferred`.

Las rutas calculan el deadline al inicio: 20 segundos para emails en el webhook y 45 en el cron, frente a límites de 30 y 60 segundos. El cron usa un presupuesto local de 35 segundos para dejar tiempo al aviso diario. El override de pruebas solo puede reducir las ventanas de petición.

Esto corrige la acumulación de presupuestos y el último envío que antes sobrepasaba la ventana. La reserva para almacenamiento y respuesta no es una cancelación de consultas: se detalla su límite más abajo.

## Verificación independiente

Comando: `node node_modules/tsx/dist/cli.mjs scripts/audit-hag125-hag121-hag122-v2.ts`.

Se ejecutaron las rutas y funciones reales con almacenamiento simulado y `fetch` interceptado, usando **temporizadores reales** a escala 1/10 para los escenarios anteriores. No se usó el reloj lógico de v1.

| Caso | Resultado observado |
| --- | --- |
| Cron: envíos 1,3 / 1,3 / 1,3 / 1,49 s y aviso diario nuevo, ventana 4,5 s | **4.512 ms**, HTTP 200; cuarto envío recortado; aviso persistido; pendientes no iniciados intactos; nada en SENDING |
| Siguiente ejecución con proveedor sano y backoff vencido simulado | Todos los pendientes enviados, incluido el aviso diario |
| Webhook: huérfano live, envíos 0,79 / 1,49 / 1,49 s, ventana 2 s | **2.006 ms**, HTTP 200; aviso persistido; entrega previa y barrido respetan la misma ventana |
| Lectura posterior al reclamo tarda 400 ms con deadline de 300 ms | `deferred`, PENDING, cero intentos, sin token y sin llamar al proveedor |
| Deadline anidado más largo que el exterior | Se respeta el exterior; envío recortado y token liberado |
| Dos reencolados concurrentes del mismo FAILED | Una transición y un incremento de auditoría |

`npx tsc --noEmit --incremental false`: **OK**, incluido el script nuevo.

La simulación a escala demuestra el comportamiento del recorte y de la recuperación; no equivale a medir el runtime desplegado ni a ejecutar PostgreSQL real. No se extrapola toda la latencia de almacenamiento multiplicándola por diez.

## Observaciones operativas — atendidas en el alcance de código

- **Correlación del programador:** el SQL guarda el request ID devuelto por pg_net en `hag_ops.email_outbox_cron_requests`. `--status` cruza esos IDs con las respuestas, evitando atribuir a este job respuestas de otras tareas. La purga limita el registro a siete días. Se inspeccionó el SQL; no se ejecutó en Supabase en esta revisión.
- **Timeout del cliente:** pasa a 75 segundos, por encima del límite de 60 del servidor, con margen de transporte. Esto evita el corte prematuro identificado; no garantiza recepción ante cualquier fallo de red.
- **Permisos:** el script revoca el acceso de `public`, `anon` y `authenticated` al esquema operativo. Los permisos efectivos y el acceso al Vault deben comprobarse al aplicar.
- **Retry ambiguo:** el botón pide confirmación cuando `lastError` contiene el timeout de la aplicación. La página aclara que conserva el destinatario y describe qué hacer ante una dirección incorrecta.
- **Responsable de operación:** la solicitud asigna revisión inicial, a las 24 horas y semanal al dueño. Esto documenta el seguimiento; no constituye un monitor externo automático.

## Límites y aceptación operativa pendiente

El deadline limita la **espera del envío**, no cancela la petición HTTP subyacente ni impone timeouts a las consultas de base de datos. Se mantiene la clave idempotente para los reintentos. Una base bloqueada o una operación de Stripe muy lenta todavía puede consumir el margen o agotar la función; la corrección elimina el exceso causado por la suma de los lotes, no todos los posibles timeouts del sistema.

La evidencia de **95/95 pruebas con PostgreSQL, build, contador 73 → 73, SQL con stubs y dry-run** fue aportada por la solicitud. Se revisó el código de las nuevas pruebas, sin reejecutar la suite que trunca datos ni verificar servicios externos.

Para cerrar operativamente HAG-122:

1. Aplicar y verificar la migración aditiva antes de desplegar el código que lee las columnas nuevas.
2. Aplicar el programador autorizado con el secreto que corresponda al endpoint desplegado.
3. Verificar varias respuestas HTTP 200 **correlacionadas con este job**, con `health`, y la recuperación de pendientes; repetir la revisión a las 24 horas según el procedimiento acordado.
4. Comprobar permisos efectivos de `hag_ops`/Vault y que el dashboard permita atender los fallidos.

Solo se agregaron este informe y el script aislado v2. No se modificó código funcional, no se ejecutaron migraciones ni se aplicó el programador, no se desplegó y no se enviaron emails.
