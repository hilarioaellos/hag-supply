# Solicitud de auditoría — Carga del Catálogo 100

Fecha: 2026-09-22
Stack: Next.js 16.2.10 + Prisma 5.22 + Supabase (PostgreSQL + Storage) · Hosting: Vercel
Estado: **GO con sugerencias (ronda 3)**. Sugerencias 1 a 3 aplicadas antes del commit.

---

## Objetivo

Reemplazar los 74 productos de muestra (imágenes de Unsplash) por 100 productos reales de la pestaña "Catálogo 100" de `Base_Productos_Vendibles_HAG.xlsx`, con sus 177 imágenes de `Imagenes-ASIN-Sep2026/`.

Decisiones del dueño:
- Tiene los permisos de uso de las imágenes.
- Stock de 5 unidades por producto.
- Los productos actuales se ocultan (`deletedAt`), no se borran.
- Precios tal cual el Excel.
- Nombres y descripciones generados en inglés y revisados sin cambios.
- Se publican los productos que parecen duplicados: tres jabones Chandrika y dos juegos 6-in-1.

---

## Cambios a auditar

| Archivo | Tipo | Resumen |
|---|---|---|
| `next.config.ts` | código (deploy) | Agrega `remotePatterns` para `tkhtldfmfivughpeyonm.supabase.co/storage/v1/object/public/product-media/**`. Sin esto, `next/image` rechaza en producción las imágenes del Storage. |
| `.gitignore` | config | Agrega `/backups/`, porque los respaldos contienen emails y hashes de contraseña. |
| `scripts/backup-db.ts` | script nuevo | Exporta todas las tablas a JSON y descarga el bucket `product-media`. Es de solo lectura. |
| `scripts/import-catalogo-100.ts` | script nuevo | Carga idempotente por `sku = ASIN`. Tiene tres modos: dry-run (por defecto), `--apply` y `--rollback`. |
| `data/catalogo-100/source.json`, `content.json` | datos | Datos extraídos del Excel, más los nombres y descripciones aprobados. |

### Detalle de `import-catalogo-100.ts`
- **Validaciones antes de escribir:** categoría existente, precio > 0, imágenes presentes, slug único (ante un choque añade el sufijo `-asin`) y ASIN presente en `content.json`. Si algo falla, termina con código 1 sin escribir nada.
- **Por producto:**
  1. `upsert` por `sku`.
  2. Las imágenes se convierten a WebP, en un lienzo cuadrado blanco de hasta 1000 px, sin ampliar.
  3. Se suben a `product-media/{productId}/images/{ASIN}_{n}.webp` con `upsert: true`.
  4. En una transacción se reemplazan las filas `ProductMedia` y se sincroniza `imageUrls`.
- **Estado previo y activación** (versión vigente desde la ronda 3): antes de la primera escritura se guardan los ids visibles en `data/catalogo-100/pre-import-state.json`. Los productos nuevos se crean ocultos, y solo al final una transacción interactiva activa los 100, verificando el conteo dentro de ella, y oculta los anteriores.
- **`--rollback`:** deja visibles exactamente los ids de `pre-import-state.json` y oculta los ASIN del catálogo. Cubre tanto fallos parciales como cargas completas.

---

## Evidencia

- **Respaldo:** `backups/2026-09-22/` con 7 tablas (74 productos, 74 media, 7 categorías, 4 usuarios, 0 pedidos, 0 ítems de carrito) y 175/175 archivos del Storage. Tag git `pre-catalogo-100`.
- **Dry-run contra producción:** 100 a crear, 0 a actualizar, 177 imágenes, 74 a ocultar. `✓ Validación OK`.
- **Chequeo de tipos:** `tsc --noEmit` sin errores en los archivos nuevos o modificados.
- **Build:** `next build` pasa en un worktree limpio (solo archivos versionados más estos cambios).
  - _(Actualizado en la ronda 2: el build del directorio de trabajo también pasa, tras mover los scripts sueltos a `_archivo/`.)_
- **Filtrado en la tienda:** la tienda filtra `deletedAt: null` en todas sus consultas: `lib/data/products.ts`, home, búsqueda y carrito. El panel admin lista también los ocultos, lo que permite recuperarlos.
- **Bucket:** `product-media` es público y no tiene restricción de tipo MIME ni de tamaño.

---

## Riesgos conocidos

1. **Orden de despliegue:** `next.config.ts` debe estar en producción (Vercel) **antes** de `--apply`. Si no, las tarjetas se ven sin imagen.
2. **Imágenes de baja resolución:** 9 imágenes miden menos de 300 px. No se amplían; se ven pequeñas pero nítidas.
3. **Cantidades por confirmar:** hay cantidades del Excel dudosas, publicadas tal cual con aprobación del dueño: Armor All (caja de 24), Refresh "Quantity 44", Johnson "Quantity 25" y el afilador Smith's a $151.93.
4. **Precio de comparación:** no se definen `comparePrice` ni `badge`. Los productos nuevos no tendrán etiquetas SALE, BEST_SELLER ni NEW.
5. **Archivos huérfanos:** quedan 175 archivos en el Storage de migraciones anteriores. No se tocan.

---

## Plan tras un GO

1. Commit y push a `master`, que dispara el deploy en Vercel.
2. Verificar que el deploy terminó.
3. Ejecutar `npm run catalog:import -- --apply`.
4. Verificación: 100 productos visibles, conteo por categoría, fichas con 1 a 3 imágenes y stock 5.
5. Si algo falla: `--rollback`, o restaurar desde `backups/2026-09-22/`.

---

## Ronda 2 — Correcciones tras el NO-GO del 2026-09-22

El dueño aprobó dividir los hallazgos en dos grupos:
- **Paquete A:** se corrige en esta entrega.
- **Paquete B:** tickets posteriores a la carga del catálogo.

### Paquete A (corregido)

| # | Hallazgo | Corrección | Evidencia |
|---|---|---|---|
| 1 | Contraseña de Postgres de Railway en `scripts/migrate-railway-to-supabase.ts` (commit `cf38230`, repo público) | Script eliminado (`git rm`; la migración a Supabase ya terminó). Se quitaron 6 entradas con la contraseña de `.claude/settings.local.json`. Ese archivo es local y ya estaba ignorado por la configuración global de git (`~/.config/git/ignore`), así que nunca se versionó. | `grep -r rlwy.net` sin resultados en el árbol de trabajo. Escaneo del historial: es la única credencial real; los `sk_test_…` son el placeholder `sk_test_placeholder`. |
| 2 | Build de producción falla por scripts sueltos | 14 scripts sin versionar de la raíz (`seed-*.ts`, `fix-image-*.ts`, `replace-images-*.ts`, `check-*.ts`, `*-issues.js`) movidos a `_archivo/`. La carpeta queda excluida en `tsconfig.json` y en `.gitignore`. No se borró nada. | `npm run build` en el directorio de trabajo: compila, TypeScript OK y 16/16 páginas generadas. |
| 3 | `params` síncrono en rutas admin (Next 16 eliminó el acceso síncrono) | Las 9 lecturas pasan a `await (context as { params: Promise<{ id: string }> }).params` en: `categories/[id]` (PATCH, DELETE), `orders/[id]/confirm-payment`, `orders/[id]/status`, `products/[id]` (PATCH, DELETE) y `products/[id]/media` (POST, DELETE, PATCH). Las páginas `page.tsx` ya usaban `await params`. | Build OK. Sin sesión, las rutas responden 401. **Falta prueba con sesión de admin después del deploy.** |
| 7 | `/api/health` expone nombres de variables de entorno, URL de la base de datos y errores de Prisma | Ahora responde solo `{status, db}` (200 o 503) con `SELECT 1` usando el cliente compartido. | `next start` local: `{"status":"ok","db":"ok"}` con código 200. |

### Paquete B (fuera de esta entrega, con ticket propio)
- **#4:** verificación real del pago con Stripe (`paymentIntents.retrieve`) y webhook.
- **#5:** terminar la migración del admin a `ProductMedia`. La carga del catálogo escribe `ProductMedia` e `imageUrls`, así que no le afecta.
- **#6:** restricciones del esquema: CHECK, `OrderItem.total`, `onDelete`, `timestamptz`, eliminar `imageUrls`.
- **Informe HAG-105:** corregir el "GO condicionado" y el estado de HAG-106/108/109, y revisar `connection_limit`/`sslmode`.

### Acción del dueño (no se puede hacer desde el código)
- La contraseña sigue en el historial de un repo público. **Mitigación:** eliminar la base de datos de Railway, que ya no se usa; con eso la credencial deja de servir.
- Recomendado: poner el repo en privado.
- No se reescribe el historial de git: no invalida una contraseña ya expuesta y obligaría a un force-push.

### Pendiente para la próxima limpieza
`railway.json` y `railway.toml` son restos del hosting anterior (hoy es Vercel).

---

## Veredicto del auditor — ronda 2

NO-GO. Hubo 1 bloqueante (credencial no revocada) y 4 hallazgos mayores (rollback ante fallo parcial, respaldo que no falla, dependencias no declaradas, archivos sensibles sin ignorar). Quedaron aprobados: build, `params`, `/api/health`, `remotePatterns`, tag, respaldo 175/175, `source.json` idéntico al Excel, 100 ASIN y 177 imágenes íntegras.

---

## Ronda 3 — Correcciones

| # | Hallazgo | Corrección | Evidencia |
|---|---|---|---|
| 1 | Credencial Railway no revocada | El dueño confirmó el 2026-09-22 que **la base de Railway fue eliminada y la cuenta no tiene recursos**. | Prueba de red del 2026-09-23T00:51Z: `tokaido.proxy.rlwy.net:38291` acepta TCP, porque es un proxy compartido de Railway. Pero al enviar un `SSLRequest` de Postgres (8 bytes, sin usuario ni contraseña) **no responde en 8 s**: no hay servidor Postgres detrás. La credencial no da acceso a nada. |
| 2 | Rollback sin cobertura ante fallo parcial | `import-catalogo-100.ts` rediseñado: **(1)** guarda `pre-import-state.json` (ids visibles + ASIN del catálogo) **antes de la primera escritura** y no lo sobrescribe en reintentos; **(2)** crea los productos nuevos **ocultos** (`deletedAt` definido); **(3)** solo si los 100 terminan, en **una transacción** activa el catálogo y oculta los anteriores, y verifica que se activaron 100. `--rollback` deja visibles exactamente los ids del estado previo. | Prueba aislada (ver abajo). |
| 3 | Respaldo termina OK aunque falten archivos | `backup-db.ts`: el manifiesto incluye `complete`; si `storageFiles < storageTotal`, lanza un error y termina con código 1. | Revisión de código. Un error de Prisma o del listado de Storage ya terminaba con código 1. |
| 4 | Dependencias no declaradas | `sharp@0.34.5` (la misma versión que usa Next) y `tsx@4.23.15` fijadas exactas en `devDependencies` y en `package-lock.json`. Comandos `npm run db:backup` y `npm run catalog:import`, sin `npx` descargando versiones sin fijar. | `package.json` y lockfile. |
| 5 | Archivos sensibles sin ignorar | `.gitignore` del repo agrega `/.claude/settings.local.json` y `*.dump`. Ya no depende de la configuración global. | `git check-ignore -v --no-index` resuelve con `.gitignore:52` y `:53`. `git status --ignored` marca `!!` en `.claude/`, `hag-supply-backup.dump`, `backups/` y `_archivo/`. |

### Prueba aislada del importador (sin tocar producción)
Entorno de prueba:
- PostgreSQL 18 embebido (`embedded-postgres`, puerto 55432) con el esquema aplicado por `prisma db push`.
- **Se restauró el respaldo `backups/2026-09-22`** (4 usuarios, 7 categorías, 74 productos, 74 media). Esto también demuestra que el respaldo se puede restaurar.
- Storage simulado con un servidor HTTP local que responde 500 a partir de la subida 61.
- Script copiado a una carpeta aislada, para no generar archivos de estado en el repo.

| Paso | Resultado |
|---|---|
| 1. `--apply` con fallo simulado | Falla en el producto 40 (`B0044UNDRO_2.jpg`) con código 1. **Tienda: 74 visibles (los anteriores), 0 del catálogo visibles**; 40 del catálogo quedan en la base, ocultos. |
| 2. `--rollback` tras fallo parcial | 74 anteriores visibles, 0 del catálogo visibles. |
| 3. Reintento `--apply` con Storage sano | Conserva el estado previo original. **100 visibles del catálogo, 0 anteriores visibles.** |
| 4. `--apply` repetido (idempotencia) | 0 a crear, 100 a actualizar. Estado final idéntico. |
| 5. `--rollback` tras carga completa | 74 anteriores visibles, 0 del catálogo visibles. |
| Integridad | 100 productos, 177 media, stock = 5 en todos, `imageUrls` = media en todos. |

### Build
`npm run build` OK después de los cambios.

---

## Veredicto del auditor — ronda 3

**GO con sugerencias.** Cierra los bloqueantes y hallazgos mayores. La credencial de Railway se acepta como cerrada por la eliminación de la base.

Sugerencias aplicadas antes del commit:
1. Secciones antiguas del informe actualizadas: `pre-import-state.json`, build OK, `npm run catalog:import`.
2. Verificación de `activated.count` movida **dentro** de una transacción interactiva: si no coincide, se revierte todo.
3. Respaldo regenerado con el script corregido (manifiesto con `complete: true`).
4. Pendiente de ejecución: tras el deploy, verificar el hostname de imágenes en Vercel antes de `--apply`; después, conteos 100/177, las 7 categorías y fichas representativas.
