# Solicitud de auditoría — HAG-116 Inventario real + productos destacados

Fecha: 2026-10-14
Stack: Next.js 16.2.10 + Prisma 5.22 + Supabase (PostgreSQL + Storage) · Hosting: Vercel
Ticket: [HAG-116](https://linear.app/hag-projects/issue/HAG-116)
Estado: **pendiente de veredicto**

---

## Objetivo

Publicar los 4 productos del inventario propio de HAG Partner LLC y mostrarlos en una sección **Featured Products** de la home. El catálogo 100, que está visible en producción, **se mantiene**. Además entran en el mismo commit los ajustes de "tienda honesta" hechos el 2026-10-06 sobre textos de la home, la ficha de producto y el footer.

Decisiones del dueño:
- Los 4 productos se publican y se destacan.
- El catálogo 100 no se oculta. La versión anterior del importador sí lo ocultaba; ese comportamiento se quitó.
- HAG-RELYTE-MB: datos completados por el dueño con fotos del empaque el 2026-10-14. 30 porciones, 6.70 oz (190 g), cero calorías, suplemento dietario, UPC 018788108740 (dígito verificador UPC-A válido) y vencimiento "Best by 10/2029" (en la descripción, porque no hay campo de vencimiento). Se eliminó la nota `_verificar`.

---

## Cambios a auditar

| Archivo | Tipo | Resumen |
|---|---|---|
| `prisma/schema.prisma` | esquema | `Product`: nuevos `brand`, `upc`, `condition` (String?) y `featured Boolean @default(false)` + `@@index([featured])`. |
| `prisma/migrations/20261006000000_add_product_brand_upc_condition/` | migración | `ADD COLUMN` brand, condition, upc (nullable). |
| `prisma/migrations/20261014000000_add_product_featured/` | migración | `ADD COLUMN featured BOOLEAN NOT NULL DEFAULT false` + índice. |
| `scripts/import-inventario-real.ts` + `npm run inventory:import` | script nuevo | Mismo flujo seguro que `import-catalogo-100.ts` (dry-run / `--apply` / `--rollback`, estado previo, carga en oculto y activación atómica). Valida `featured` y lo guarda. **No oculta** el resto del catálogo. |
| `data/inventario-real/productos.json` | datos | 4 productos, 20 imágenes de `i.ebayimg.com`, `featured: true`. |
| `app/(store)/page.tsx` | código | Nueva sección "Featured Products" (`featured = true`, máx. 12), que solo se muestra si hay destacados. "Our Products" excluye los destacados para no repetirlos. Beneficios reescritos: Ships from Florida, Real Inventory y New Products. |
| `app/(store)/product/[slug]/page.tsx`, `lib/data/products.ts` | código | Muestra marca, condición y UPC. Quita las estrellas falsas (4.2 / 127 reviews) y los sellos de confianza que no aplican ("Free shipping over $50", "30-day returns"). |
| `components/product/ProductCard.tsx` | código | Quita las estrellas decorativas y pone "No reviews yet". |
| `components/layout/Footer.tsx` | código | Categorías reales de la base de datos. Quita el teléfono y el email ficticios, el newsletter que no funcionaba y los enlaces de ayuda y políticas que no existen. |
| `lib/data/categories.ts` | código | Solo lista categorías con al menos un producto visible. |
| `components/layout/CategoryNav.tsx`, `app/(store)/deals/page.tsx`, `cart/page.tsx`, `CartDrawer.tsx`, `register/page.tsx` | textos | Quita promesas que no se cumplen: "free shipping", "updated weekly", "fast delivery". |

---

## Riesgo principal: aplicar el esquema en producción

La base de datos de Supabase **no tiene tabla `_prisma_migrations`**, porque se restauró con `pg_dump` (HAG-108). `prisma migrate status` da como pendientes incluso `20260812000000_add_product_media_keep_imageurls`, que ya está aplicada. Por eso:

- **No se usa `prisma migrate deploy`**: intentaría recrear `ProductMedia` y fallaría.
- Las dos migraciones nuevas se aplican con `prisma db execute --file` (solo `ADD COLUMN` + índice, aditivas).
- **Orden obligatorio: base de datos antes que deploy.** El código nuevo consulta `featured`, `brand`, `upc` y `condition`. Si Vercel despliega antes de que existan las columnas, la home y la ficha de producto fallan. El código actual en producción no se ve afectado por columnas nuevas.

Plan de ejecución tras el GO:
1. `npm run db:backup` (respaldo de las tablas y del Storage).
2. `npx prisma db execute --file prisma/migrations/20261006000000_add_product_brand_upc_condition/migration.sql --schema prisma/schema.prisma`
3. Lo mismo con `20261014000000_add_product_featured/migration.sql`.
4. `npm run inventory:import -- --apply`
5. Revisar en local (`next dev` contra producción): la home muestra Featured con los 4 y la ficha muestra marca, condición y UPC.
6. Commit y push a master (deploy en Vercel), luego verificar supply.hagpartner.com.

Rollback:
- Datos: `npm run inventory:import -- --rollback` oculta los 4 y deja el catálogo como estaba.
- Esquema: las columnas nuevas son nullables o tienen default, así que pueden quedarse.
- Código: revert del commit.

---

## Evidencia

- **Dry-run contra producción** (solo lectura): 4 a crear, 0 a actualizar, 2 categorías nuevas (Health and Wellness, Toys and Collectibles), 20 imágenes, 4 destacados, 100 productos visibles que no se tocan. `✓ Validación OK`.
- **Imágenes de origen:** las 20 URLs responden `200 image/jpeg`.
- **Estado actual de producción:** 174 productos, 100 visibles, 0 con badge.
- **Chequeo de tipos:** `tsc --noEmit` sin errores.
- **Build:** `next build` OK.

## Puntos a revisar por el auditor

1. ¿Es correcto aplicar las migraciones con `db execute` dado que no hay historial, o conviene antes hacer baseline (`prisma migrate resolve --applied`) de todas?
2. Rollback: `--rollback` restaura `visibleIds` y oculta los SKU del inventario, pero no revierte `featured`. Como los productos quedan ocultos, no se muestran.
3. Las imágenes vienen de eBay: el script las descarga y las sube a nuestro Storage, así que no dependen del anuncio.
4. Las categorías nuevas toman como portada la primera imagen de su primer producto.
5. Falta el toggle de `featured` en /admin, así que hoy solo se marca vía importador o SQL. Propuesto como seguimiento.
