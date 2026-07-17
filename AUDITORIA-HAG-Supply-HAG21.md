# HAG Supply — Auditoria HAG-21
**Fecha:** 17 julio 2026
**Scope:** Admin CRUD de productos
**Base aprobada:** `817b6ed` (HAG-20 GO)
**Estado working tree:** sin commit (pendiente GO)
**`tsc --noEmit`:** PASS

---

## Qué se construyó

1. **API routes** (`/api/admin/products`)
   - GET — lista paginada (20/página) con búsqueda por nombre/SKU
   - POST — crear producto con validación slug único
   - PATCH `/api/admin/products/[id]` — editar con slug check
   - DELETE `/api/admin/products/[id]` — soft delete (deletedAt = now())

2. **UI**
   - `/admin/products/page.tsx` — tabla paginada con búsqueda, botones editar/eliminar
   - `/admin/products/new/page.tsx` — form para crear
   - `/admin/products/[id]/edit/page.tsx` — form para editar

3. **Componentes**
   - `ProductForm.tsx` — form reutilizable (nuevo/editar) con auto-slug desde nombre
   - `ProductsTable.tsx` — tabla con acciones, badges de estado (Active/Deleted)

---

## Verificaciones

```
tsc --noEmit                              → PASS
POST /api/admin/products (withAdmin)      → Crea producto, slug único
PATCH /api/admin/products/[id]            → Edita, re-valida slug
DELETE /api/admin/products/[id]           → Soft delete (deletedAt = now())
GET /api/admin/products?q=term&page=1     → Lista paginada, búsqueda funcional
/admin/products tabla                     → Renderiza items, acciones funcionales
Form auto-slug                            → Genera slug desde nombre (convertible)
```

---

## Archivos nuevos o modificados

### API Routes

- `app/api/admin/products/route.ts` — GET (paginado), POST (validación)
- `app/api/admin/products/[id]/route.ts` — PATCH (editar), DELETE (soft delete)

### UI Pages

- `app/admin/products/page.tsx` (actualizado de stub) — tabla funcional
- `app/admin/products/new/page.tsx` — form create
- `app/admin/products/[id]/edit/page.tsx` — form edit

### Componentes

- `components/admin/ProductForm.tsx` — form reutilizable (create/edit)
- `components/admin/ProductsTable.tsx` — tabla con acciones

---

## Detalles técnicos

### Búsqueda y paginación

GET `/api/admin/products?page=1&q=drill`:
```json
{
  "items": [...],
  "total": 45,
  "page": 1,
  "pages": 3
}
```

Búsqueda case-insensitive en `name` y `sku`. Ordenado por fecha desc (más recientes primero).

### Form validación

- Nombre requerido
- Slug único (re-validado al editar)
- Precio y stock requeridos
- Categoría requerida (select from DB)
- Compare price opcional
- Imágenes: textarea, una URL por línea
- Badge: select (SALE, BEST_SELLER, NEW, o sin badge)

### Soft delete

DELETE no elimina fila. Actualiza `deletedAt = now()`. La tabla muestra badge "Deleted" para soft-deleted.

### PATCH validación

Antes de editar:
- Verificar slug único si cambió
- Verificar categoría existe si cambió
- Validaciones de tipos (precio, stock, etc.)

---

## Notas

### Auto-slug

El form auto-genera slug desde el nombre (lowercase, replace spaces/special chars con `-`, trim `-`). Usuario puede editar manualmente. Validación ocurre en el servidor (POST/PATCH).

### Componentes reutilizables

`ProductForm` se reutiliza para create (`/new`) y edit (`/[id]/edit`). El componente detecta si `product` prop existe para cambiar entre POST y PATCH, y cambiar el texto del botón.

### Lazy loading de categorías

Ambas páginas (new/edit) cargan categorías del DB server-side. No hay API separate para categorías (ocurre en HAG-22).

### Paginación simple

Links prev/next en la página. No uso el componente `Pagination` reutilizable porque requería callback; implementé inline con Links.

---

## Condiciones para GO

HAG-21 puede pasar a `GO` cuando:

1. ✅ API GET retorna items paginados y totales correctos
2. ✅ API POST crea producto con slug único, valida categoría existe
3. ✅ API PATCH edita producto, re-valida slug y categoría
4. ✅ API DELETE soft-deletes (deletedAt = now()), productos aparecen como "Deleted" en tabla
5. ✅ Tabla /admin/products renderiza items, búsqueda funciona, paginación funciona
6. ✅ Form create/edit con auto-slug, validación, submit exitoso
7. ✅ Links editar en tabla abren form con datos pre-poblados
8. ✅ Acciones protegidas: solo ADMIN puede acceder (withAdmin guard)
9. ✅ `tsc --noEmit` PASS
