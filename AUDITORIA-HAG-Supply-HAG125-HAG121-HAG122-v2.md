# Auditoría v2 — HAG Supply · HAG-122 (corrección del NO-GO) + HAG-125/HAG-121

**Fecha:** 2026-10-16 · **Base:** `e5d1a95` · **Diff completo:** `AUDITORIA-HAG-Supply-HAG125-HAG121-HAG122-v2-cambios.diff` (13 archivos; reemplaza al de v1)
**Responde a:** `AUDITORIA-HAG-Supply-HAG125-HAG121-HAG122-veredicto.md` (HAG-125 y HAG-121 GO técnico; HAG-122 NO-GO).
**Estado:** sin commit, sin migración en producción y sin programador aplicado.

HAG-125 no cambió desde v1. En HAG-121 solo cambiaron los textos para el operador (punto 4.3 y 4.4 del veredicto). Esta ronda corrige el hallazgo mayor de HAG-122 y atiende las observaciones operativas.

## 1. Hallazgo MAYOR — deadline compartido por toda la petición

**Causa confirmada.** `budgetMs` solo impedía *empezar* envíos, y el último envío podía durar 15 s más. Además, cada `deliverPending` (aviso, confirmación, barrido) abría un presupuesto nuevo.

**Corrección** (`lib/order-emails.ts`):

1. **`withEmailDeadline(deadlineAt, fn)`** usa `AsyncLocalStorage` para fijar un deadline absoluto para todo lo que corre dentro de `fn`. Así cubre cualquier camino anidado sin pasar parámetros: `handleStripeEvent → notifyAdmin / sendOrderConfirmation / oversell`, el barrido y el aviso de salud. Un deadline anidado nunca extiende al exterior (`min`).
2. **Todo envío termina antes del deadline.** El timeout de cada envío es `min(EMAIL_SEND_TIMEOUT_MS, deadline − ahora)`. Ya no hay "último envío en vuelo" que se pase.
3. **No se empieza un envío sin ventana útil.** Con menos de `EMAIL_MIN_SEND_WINDOW_MS` (3 s) restantes, el lote se detiene y no reclama la fila.
4. **Latencia de la base:** después del reclamo y la lectura se vuelve a comprobar la ventana. Si la base tardó y ya no cabe, el reclamo se libera (PENDING, intento devuelto, sin llamar al proveedor). El resultado es el nuevo `DeliveryResult` `"deferred"`.
5. **`budgetMs` cambia de significado.** Ahora es el plazo en que el lote debe *terminar*, siempre dentro del deadline de la petición.

**Ventanas por ruta** (constantes en `lib/order-emails.ts`, no exportadas desde los route files porque Next rechaza exports no estándar):

| Ruta | maxDuration | Ventana de envíos | Reserva para base y respuesta |
|---|---|---|---|
| `POST /api/webhooks/stripe` | 30 s | 20 s desde que llega la petición | 10 s |
| `GET /api/cron/email-outbox` | 60 s | 45 s (lote hasta 35 s, deja ventana al aviso de salud) | 15 s |

El deadline se calcula **al inicio** del handler, así cuenta también la verificación de firma y el trabajo de `handleStripeEvent`. `EMAIL_REQUEST_WINDOW_MS` solo puede **achicar** la ventana; lo usan las pruebas, y un valor mayor se ignora (probado).

**Cliente pg_net:** `timeout_milliseconds` pasa de 60 000 a **75 000**, por encima de `maxDuration` (60 s). Así el job recibe siempre la respuesta del servidor (200, o el 504 de Vercel si ocurriera) en vez de cortar antes. Se interpola sin separador `_` para no depender de PG ≥ 16.

## 2. Validación pedida

Suite `scripts/test-checkout.ts`: **95/95 OK** (86 de v1 + 9 nuevas) contra PostgreSQL 18 local desechable. Contador de avisos huérfanos en producción **73 → 73**. Las rutas reales se ejercitan con el proveedor real (SDK de Resend). Solo se intercepta `api.resend.com` con latencias o errores programados **en tiempo real**, así que los timeouts y el deadline actúan de verdad. Escala de prueba: ventana 3 s, timeout de envío 1,5 s, ventana mínima 0,3 s y holgura de 1 s para base y respuesta.

| Prueba | Resultado |
|---|---|
| Escenario del veredicto, **cron** (13 / 13 / 13 / 14,9 s + aviso diario nuevo), a escala 1/10 con ventana 4,5 s | **4 512 ms** (antes del arreglo: 6 880 a esta escala). En escala real ≈ 45,1 s < 60 s. Aviso persistido, nada en SENDING |
| Escenario del veredicto, **webhook** (huérfano 7,9 / 14,9 s + barrido 14,9 s), a escala 1/10 con ventana 2 s | **2 006 ms** (antes: 3 770). En escala real ≈ 20,1 s < 30 s. Aviso persistido |
| Cron completo: backlog de 6 + proveedor lento + aviso diario nuevo | 200 dentro de ventana + holgura. ≥ 3 pendientes **sin tocar** (PENDING, 0 intentos). Aviso persistido. Las ejecuciones siguientes con el proveedor sano envían **todo** lo vencido, aviso incluido |
| Cron con proveedor **colgado** y `EMAIL_SEND_TIMEOUT_MS` = 60 s | Un solo envío, **cortado en el deadline** (≈ 3 s), no en su timeout propio. Nada queda en SENDING |
| Cron con **fallos del proveedor** (HTTP 500) | 200 dentro de la ventana. Cada fila queda PENDING con 1 intento, backoff y `lastError` |
| Webhook completo: pago huérfano live (aviso, entrega previa) + barrido global | 200 dentro de la ventana. Pendientes no iniciados intactos. Luego recuperados por el cron, aviso incluido |
| **Latencia de almacenamiento:** lectura de la fila con +500 ms tras el reclamo | `"deferred"`: PENDING, intentos sin cambio, sin token, proveedor no llamado. Sin deadline se envía normal |
| Deadline anidado: lote con presupuesto de 60 s dentro de una petición de 1 s | Termina en < 1,3 s |
| Ventanas declaradas | Reserva ≥ 10 s frente a `maxDuration` en ambas rutas. El override no puede ampliar |

La prueba existente de `budgetMs` se ajustó a la nueva semántica: ahora exige terminar dentro de `450 ms + 200`, no solo dejar de empezar envíos.

**Sobre `scripts/audit-hag125-hag121-hag122.ts` (el script del auditor).** Contra el código nuevo da 53 900 ms lógicos en vez de 68 800. Su reloj lógico avanza la duración completa asignada al proveedor aunque el envío ya se haya cortado: `withTimeout` usa `setTimeout` real, que nunca vence en tiempo lógico. Por eso no puede mostrar el recorte del 4.º envío (ventana restante 6 s, timeout 6 s). Las pruebas de la tabla reproducen sus mismos dos escenarios en tiempo real a escala 1/10, donde el recorte sí ocurre.

Además: `npx tsc --noEmit` y `npx next build` OK. El SQL exacto del job se ejecutó contra PostgreSQL local con stubs de `net.http_get` y `vault.decrypted_secrets`: inserta el request id y purga los registros de más de 7 días. Dry-run del programador OK.

## 3. Observaciones operativas del veredicto

1. **`--status` correlacionado con el job.** El job ahora es `with req as (select net.http_get(...) as id), purge as (delete … > 7 días) insert into hag_ops.email_outbox_cron_requests (request_id) select id from req`. `--status` cruza **esos** ids con `net._http_response` y muestra código, `TIMEOUT` o "sin respuesta (en curso o purgada)". El esquema `hag_ops` queda fuera de Prisma y con `revoke all … from public, anon, authenticated`. `--apply` lo crea de forma idempotente.
2. **Quién comprueba el ejecutor (para live).** Responsable: el dueño (hagpartnerllc@gmail.com). Tras aplicar: `--status` a los ~10 min y otra vez a las 24 h; después, una revisión semanal de `--status` y de Admin → Emails. Una caída del cron también se ve en el dashboard: todo pendiente pasa a "overdue" a los 30 min y aparece la tarjeta ámbar.
3. **Retry tras timeout.** Si el `lastError` del email FAILED es un timeout, el botón pide confirmación antes de reintentar: el proveedor pudo haberlo entregado, así que primero hay que revisarlo en Resend.
4. **Direcciones inválidas.** La página explica que Retry reenvía a la **misma** dirección. Si la dirección está mal, hay que contactar al cliente desde el propio correo. No se agrega edición de destinatarios en esta ronda.
5. **Vault.** Sin cambios. Los permisos reales se verificarán al aplicar (`--apply` corre como `postgres`).

## 4. Despliegue propuesto (tras GO)

1. Commit (sin `components/layout/SearchBar.tsx`, que es otra auditoría, ni `scripts/audit-*.ts`).
2. Respaldo: `scripts/backup-db.ts`.
3. `npx prisma db execute --file prisma/migrations/20261016020000_email_outbox_requeue/migration.sql --schema prisma/schema.prisma` y verificar las 3 columnas, **antes del push**.
4. Push a master (Vercel).
5. Con autorización del dueño: `npx tsx scripts/schedule-email-outbox.ts --apply`. Después `--status` en varias ejecuciones: respuestas **200 del job correcto** con `health`, y recuperación de algún pendiente si lo hay. No basta con `job_run_details = succeeded`.

**Rollback:** `--unschedule`; las columnas son aditivas; revert del commit.
