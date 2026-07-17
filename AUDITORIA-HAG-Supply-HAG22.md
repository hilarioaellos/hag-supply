# HAG Supply — Auditoria HAG-22
**Fecha:** 17 julio 2026
**Scope:** Admin CRUD de categorías
**Base aprobada:** `fd9a019` (HAG-21 GO)
**Estado working tree:** sin commit (pendiente GO)
**`tsc --noEmit`:** PASS

---

## Qué se construyó

1. **API routes** (`/api/admin/categories`)
   - GET — lista todas con conteo de productos activos
   - POST — crear con validación nombre/slug únicos
   - PATCH `/api/admin/categories/[id]` — editar con re-validación
   - DELETE `/api/admin/categories/[id]` — con protección 409 si tiene productos

2. **UI**
   - `/admin/categories/page.tsx` — tabla con imagen, nombre, slug, producto count, acciones
   - `/admin/categories/new/page.tsx` — form para crear
   - `/admin/categories/[id]/edit/page.tsx` — form para editar

3. **Componentes**
   - `CategoryForm.tsx` — form reutilizable (nuevo/editar) con auto-slug
   - `CategoriesTable.tsx` — tabla con imagen thumbnail, validación delete

---

## Verificaciones

```
tsc --noEmit                                    → PASS
GET /api/admin/categories                       → Lista todas con _count
POST /api/admin/categories (withAdmin)          → Crea, valida nombre/slug únicos
PATCH /api/admin/categories/[id]                → Edita, re-valida nombre/slug
DELETE /api/admin/categories/[id]               → Elimina solo si sin productos, 409 si hay
/admin/categories tabla                         → Renderiza imagen, nombre, slug, count
Delete button deshabilitado si tiene productos  → Visual feedback, no clickeable
```

---

## Archivos nuevos o modificados

### API Routes

- `app/api/admin/categories/route.ts` — GET (todas), POST (crear)
- `app/api/admin/categories/[id]/route.ts` — PATCH (editar), DELETE (con validación)

### UI Pages

- `app/admin/categories/page.tsx` (actualizado de stub) — tabla funcional
- `app/admin/categories/new/page.tsx` — form create
- `app/admin/categories/[id]/edit/page.tsx` — form edit

### Componentes

- `components/admin/CategoryForm.tsx` — form reutilizable
- `components/admin/CategoriesTable.tsx` — tabla con validación

---

## Detalles técnicos

### Protección DELETE

Si categoría tiene productos activos (deletedAt = null):
- GET retorna `productCount > 0`
- DELETE retorna 409 con mensaje descriptivo
- UI deshabilita botón Delete con color gris

### Validación nombres/slugs

POST y PATCH validan:
- `name` único (case-sensitive en BD, actualizar si requerimiento cambia)
- `slug` único
- Re-validación en PATCH solo si el valor cambió

### Auto-slug

Mismo patrón que HAG-21:
- Genera slug desde nombre (lowercase, replace, trim)
- Flag `slugModified` previene sobrescribir manual edits
- Label "(auto-generate disabled)" cuando modificado manualmente

### Imagen thumbnail

Tabla muestra:
- Imagen real si `imageUrl` existe (Image component, 40x40px)
- Placeholder gris si null (no existe)

---

## Notas

### Sin paginación

Diferencia con HAG-21: categorías típicamente son pocas decenas, no miles. GET retorna todas sin paginación.

### Conteo de productos

Usa `_count` con where clause: `products: { where: { deletedAt: null } }` para contar solo productos activos, no soft-deleted.

### Validación de eliminación

El check ocurre server-side en DELETE. UI deshabilitando el botón es UX sugar, pero el servidor es la autoridad.

---

## Condiciones para GO

HAG-22 puede pasar a `GO` cuando:

1. ✅ API GET retorna todas las categorías con producto count correcto
2. ✅ API POST crea categoría, valida nombre/slug únicos
3. ✅ API PATCH edita, re-valida nombre/slug
4. ✅ API DELETE retorna 409 si categoría tiene productos activos
5. ✅ Tabla renderiza imagen, nombre, slug, producto count
6. ✅ Botón Delete deshabilitado si productCount > 0
7. ✅ Form create/edit con auto-slug, validación, submit exitoso
8. ✅ Links editar en tabla abren form con datos pre-poblados
9. ✅ Acciones protegidas: solo ADMIN puede acceder (withAdmin guard)
10. ✅ `tsc --noEmit` PASS
