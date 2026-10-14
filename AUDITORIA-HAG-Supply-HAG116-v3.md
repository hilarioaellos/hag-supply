# Re-auditoría — HAG-116 Inventario real + productos destacados (v3)

Fecha: 2026-10-14
Ticket: [HAG-116](https://linear.app/hag-projects/issue/HAG-116)
Veredicto anterior (v2): **NO-GO** por 1 mayor. Están cerrados: el respaldo, el rollback que republicaba productos ajenos, los logs de la home y la etiqueta UPC/EAN.
Documentos base: `AUDITORIA-HAG-Supply-HAG116.md` y `-v2.md`. El alcance, el riesgo de esquema y el plan de ejecución no cambian.
Estado: **pendiente de veredicto**

---

## MAYOR — Un producto oculto pudo haberse publicado y vendido → RESUELTO

El ciclo de la carga queda registrado **en la base**, no solo en el archivo de estado. La verificación ocurre al escribir.

### Cambios en `scripts/import-inventario-real.ts`

1. **Marca "nunca publicado" en la base.** El importador crea los productos con `deletedAt = NEVER_PUBLISHED` (`1970-01-01T00:00:00Z`). Ningún otro flujo escribe esa fecha: `/admin` oculta con `new Date()` (`app/api/admin/products/[id]/route.ts:89`) y `--rollback` también usa la fecha actual.
2. **Retomar se verifica al escribir:** `updateMany({ where: { sku, deletedAt: NEVER_PUBLISHED }, data })` debe devolver `count === 1`; si no, la carga aborta sin activar nada. Un producto que se publicó y después se ocultó tiene una fecha real, no la marca, así que nunca se retoma y su stock no se toca.
3. **Activar se verifica al escribir:** `updateMany({ where: { sku in skus, deletedAt: NEVER_PUBLISHED }, data: { deletedAt: null } })` debe devolver `count === 4` dentro de la transacción; si no, se revierte todo.
4. **Fases del ciclo en el archivo de estado:** `loading` → `published` (después del commit de activación) o `rolled_back` (después de `--rollback`). La validación rechaza cualquier `--apply` cuya fase no sea `loading`, y también si los SKU del JSON no coinciden con los de la carga en curso. Es una segunda capa: si se pierde la escritura de la fase, la base sigue protegiendo (escenario S4).
5. **Validación previa:** un SKU existente solo se acepta si está en `createdSkus` y conserva exactamente `deletedAt = NEVER_PUBLISHED`.
6. **`--rollback`:** oculta con fecha real los SKU de la carga que estén visibles **o** con la marca (cargas a medio terminar), y deja la fase en `rolled_back`. El ciclo queda cerrado para siempre.

Corrección del ciclo: publicar o revertir termina la carga. Para cargar productos nuevos más adelante hace falta un ciclo nuevo, con otro archivo de estado y SKU nuevos. Para editar productos publicados se usa `/admin`.

---

## Evidencia: pruebas en una base aislada

Entorno:
- PostgreSQL 18 **desechable** (`initdb` en el scratchpad, puerto 5544, sin relación con Supabase), con el esquema cargado vía `prisma db push`.
- **Storage falso** local que puede simular un fallo en un producto.
- Imágenes reales de eBay.
- El importador real se ejecutó sin modificaciones (`tsx scripts/import-inventario-real.ts`), con `DATABASE_URL` y `SUPABASE_URL` apuntando al entorno de prueba.
- Semilla: la categoría "Home and Kitchen" y un producto ajeno visible (`AJENO-1`, stock 3).

| # | Escenario | Resultado |
|---|---|---|
| S1 | `--apply` con fallo de Storage en el 3.er producto | exit 1, fase `loading`. RELYTE, GV07 y SV02 quedan en `1970-01-01`; ninguno visible. |
| S2 | **Retomar** `--apply` con Storage OK | exit 0, **4 visibles**, fase `published`. RELYTE con stock 10. |
| S3 | **Venta** (RELYTE 10 → 9) y nuevo `--apply` | Rechazado (4 SKU "ya se publicó" más la fase `published`). **Stock 9.** |
| S4 | Igual, con la fase forzada a `loading` (simula que se perdió la escritura de la fase) | Rechazado por la base. **Stock 9.** |
| S5 | Ocultar desde /admin (`deletedAt = now()`), fase `loading` y `--apply` | Rechazado. **Stock 9.** |
| S6 | `--rollback` y luego `--apply` | Rollback: 3 ocultos (RELYTE ya estaba oculto); fase `rolled_back`; el `--apply` se rechaza. **Stock 9.** |
| S7 | Después del rollback, fase forzada a `loading` y `--apply` | Rechazado por la base. **Stock 9.** |
| Escritura | Las mismas consultas de retomar y activar, ejecutadas directamente sobre RELYTE ya publicado y ocultado | `retomar count=0 · activar count=0 · stock=9`. La protección funciona al escribir, no solo en la validación. |

`AJENO-1` siguió visible y con stock 3 en todos los escenarios.

Se cumplen las dos condiciones del NO-GO:
- Una carga que falla antes de publicar **se puede retomar** (S1 → S2).
- La secuencia publicar → vender → ocultar → reimportar **no repone stock**, sea por rollback (S6, S7) o por /admin (S5), aunque el archivo de estado se altere (S4, S7).

## Evidencia general

- `tsc --noEmit --incremental false`: OK.
- `next build`: OK.
- Dry-run contra producción (solo lectura): 4 a crear, 0 a retomar, 2 categorías nuevas, 20 imágenes, 4 destacados, 100 visibles que no se tocan. `✓ Validación OK`.
- El entorno de prueba se detuvo después de usarlo. Las pruebas no dejaron archivos en el repo (no hay `pre-import-state.json` en `data/inventario-real/`).

## Nota operativa

El archivo de estado `data/inventario-real/pre-import-state.json` se queda **local y fuera del commit**, igual que el del catálogo 100.

Pendiente menor: el toggle de `featured` en /admin queda como seguimiento.
