# Re-auditoría — HAG-116 Inventario real + productos destacados (v2)

Fecha: 2026-10-14
Ticket: [HAG-116](https://linear.app/hag-projects/issue/HAG-116)
Veredicto anterior: **NO-GO** (1 bloqueante, 2 mayores, 3 menores)
Documento base: `AUDITORIA-HAG-Supply-HAG116.md`. El alcance y el riesgo de esquema no cambian.
Estado: **pendiente de veredicto**

---

## 1. BLOQUEANTE — El respaldo dependía de columnas inexistentes → RESUELTO

`scripts/backup-db.ts` ya no usa los modelos de Prisma. Cada tabla se lee con SQL directo:

```sql
SELECT row_to_json(t) AS r FROM "<Tabla>" t
```

Así respalda **las columnas que existan en la base**, sin importar lo que tenga el cliente generado. Además verifica la integridad:
- Cada archivo JSON se vuelve a leer y su número de filas debe coincidir con `SELECT count(*)` de la tabla. Si no coincide, el script termina con error.
- Los archivos de Storage vacíos cuentan como fallo. El respaldo solo se marca `complete: true` si se descargaron todos los archivos.

**Evidencia (ejecutado contra producción con el cliente nuevo ya generado):** `backups/2026-10-14-pre-hag116/`
- Tablas: User 5, Category 7, Product 174, ProductMedia 251, CartItem 1, Order 0, OrderItem 0. Coinciden con los `count(*)`.
- `Product.json` tiene las 14 columnas reales de producción (sin brand/upc/condition/featured). Esto confirma que el respaldo ya no depende del cliente.
- Storage: 352/352 archivos. `manifest.json` → `complete: true`.

No hay `pg_dump` instalado en esta máquina, por eso se eligió el script independiente del esquema.

## 2. MAYOR — Reejecutar podía reponer stock vendido → RESUELTO

El importador ahora **solo crea** productos (`scripts/import-inventario-real.ts`):
- **Validación:** un SKU que ya existe es un error, salvo que figure en `createdSkus` del archivo de estado **y** siga oculto. Ese caso es un intento anterior incompleto: el producto nunca se vio ni se vendió.
- **Escritura:** el `upsert` se reemplazó por `create` para los SKU nuevos y `updateMany({ where: { sku, deletedAt: { not: null } } })` para retomar. La condición "sigue oculto" va **dentro del mismo UPDATE**. Si el producto se publicó entre la validación y la escritura, `count !== 1` y la carga aborta sin activar nada.
- **Activación:** solo activa los SKU que siguen ocultos (`deletedAt: { not: null }`) y exige `count === 4` dentro de la transacción.
- Un producto ya publicado nunca se modifica desde el importador, así que no se pisan stock, precio, imágenes ni ediciones de /admin. Su edición queda en /admin.

**Evidencia:** prueba con el SKU `B00Q2FTJ1I` (catálogo 100, visible) agregado temporalmente al JSON. Resultado: `✗ 1 errores: B00Q2FTJ1I: ya existe en la tienda (no lo creó esta carga); edítalo en /admin`. El JSON se restauró después.

## 3. MAYOR — El rollback no revertía cambios y re-mostraba productos ajenos → RESUELTO

- El archivo de estado ahora guarda `{ createdAt, createdSkus }` en lugar de `visibleIds`.
- `--rollback` solo oculta los productos con `sku in createdSkus` que estén visibles. No vuelve a mostrar nada, así que no reaparecen productos ocultados desde /admin, y no toca ningún otro producto.
- Como la carga nunca modifica productos existentes, ocultar lo creado deja la tienda como estaba.
- Si se ejecuta sin estado previo, falla con el error `No existe data\inventario-real\pre-import-state.json; nunca se ejecutó --apply.`, verificado.
- Lo que no se revierte, a propósito, porque no es visible: las dos categorías nuevas (`getCategories` solo lista categorías con productos visibles) y las imágenes subidas a Storage.

## Observaciones menores

| Observación | Estado |
|---|---|
| `catch` silenciosos en la home | Resuelto: `getFeaturedProducts` y `getLatestProducts` hacen `console.error("[home] …", error)` y luego devuelven `[]`. |
| Etiqueta UPC con un EAN de 13 dígitos (Jurassic Park `5060224082423`) | Resuelto: la ficha muestra **UPC/EAN**. |
| Toggle de `featured` en /admin | Queda como seguimiento. |

---

## Plan de ejecución tras el GO (actualizado)

1. `npx tsx scripts/backup-db.ts backups/<fecha>-pre-hag116` y verificar `manifest.json` → `complete: true`. Ya ejecutado una vez como evidencia; se repite justo antes de aplicar.
2. `npx prisma db execute --file prisma/migrations/20261006000000_add_product_brand_upc_condition/migration.sql --schema prisma/schema.prisma`
3. Lo mismo con `20261014000000_add_product_featured/migration.sql`.
4. `npm run inventory:import -- --apply`
5. Revisión local (`next dev` contra producción): la home muestra Featured con los 4 y la ficha muestra marca, condición y UPC/EAN.
6. Commit y push a master (Vercel), luego verificar supply.hagpartner.com.

Baseline del historial de migraciones: queda fuera de este cambio. Como indicó el auditor, se hará después de comprobar qué migraciones están realmente aplicadas.

## Evidencia general

- `tsc --noEmit --incremental false`: OK.
- `next build`: OK.
- Dry-run contra producción: 4 a crear, 0 a retomar, 2 categorías nuevas, 20 imágenes, 4 destacados, 100 visibles que no se tocan. `✓ Validación OK`.
- Datos del Relyte completados con fotos del empaque: 30 servings, 6.70 oz, UPC 018788108740 (dígito verificador válido), Best by 10/2029.
