# HAG Supply — Auditoria HAG-21 (v2 — re-auditoria post NO GO)
**Fecha:** 17 julio 2026
**Scope:** Admin CRUD productos — fixes aplicados
**Base aprobada:** `78dbe85` (HAG-21 inicial)
**Veredicto anterior:** NO GO (3 hallazgos: 1 bloqueante, 2 sugerencias)
**`tsc --noEmit`:** PASS

---

## Veredicto

Los 3 hallazgos están resueltos:

1. ✅ **Bloqueante**: Server Component con onKeyDown/window.location → Formulario HTML puro
2. ✅ **Sugerencia 1**: process.env.NEXTAUTH_URL frágil → Consulta DB directamente
3. ✅ **Sugerencia 2**: price && previene actualizar a 0 → price !== undefined
4. ✅ **Sugerencia 3**: Slug se regenera → Slug manual persiste hasta edición intencional

Con eso, HAG-21 pasa a `GO`.

---

## Hallazgos del NO GO y como se resolvieron

| Hallazgo | FIX verificado |
|---|---|
| Bloqueante: Server Component con onKeyDown + window.location.href | ✅ Formulario HTML puro (method=get) |
| Sugerencia 1: process.env.NEXTAUTH_URL no robusto | ✅ Consulta DB directamente en Server Component |
| Sugerencia 2: price && previene precio 0 | ✅ Cambiar a price !== undefined |
| Sugerencia 3: Slug se regenera si editas nombre | ✅ Slug manual respetado con flag slugModified |

---

## Verificaciones finales

```text
tsc --noEmit                                    → PASS
/admin/products (formulario búsqueda)           → HTML puro, GET request
GET /admin/products?q=drill&page=1              → DB consultado server-side, sin fetch
PATCH /api/admin/products/[id] price=0         → Actualiza correctamente
ProductForm nombre + slug manual                → Slug manual persiste, no sobrescrito
```

---

## Cambios específicos

### app/admin/products/page.tsx

- ❌ Remover: `onKeyDown`, `window.location.href`
- ✅ Agregar: `async function getProducts()` — consulta DB directo
- ✅ Cambiar: `<input onKeyDown>` → `<form method="get">`
- ✅ Convertir: `price: Decimal` → `price: string` en mapeo
- ✅ Convertir: `deletedAt: Date | null` → `string | null` en mapeo

### app/api/admin/products/[id]/route.ts

- ✅ Cambiar: `...(price && { ... })` → `...(price !== undefined && { ... })`

### components/admin/ProductForm.tsx

- ✅ Agregar: `const [slugModified, setSlugModified]` flag
- ✅ Cambiar: `handleNameChange()` — solo auto-regenera si !slugModified
- ✅ Agregar: `onChange` en input slug → `setSlugModified(true)`
- ✅ Mostrar: Label "(auto-generate disabled)" cuando slugModified = true

---

## Commit

`a20df81 fix: HAG-21 — Server Component search + price 0 + slug UX`

---

## Notas

### Búsqueda como formulario puro

La forma más robusta en Next.js App Router:
```tsx
<form action="/admin/products" method="get">
  <input type="text" name="q" defaultValue={q} />
  <input type="hidden" name="page" value="1" />
</form>
```

Sin JavaScript, sin client-side navigation, simple.

### DB directo vs fetch()

Mejor consultar DB directamente en Server Component que hacer fetch a tu propio API. Evita:
- Dependencia de process.env.NEXTAUTH_URL
- Round trip de red innecesario
- Problemas de host/dominio en diferentes ambientes

### Price !== undefined

Permite:
- Actualizar price a 0 (promoción, liquidación)
- Actualizar solo algunos campos sin "pisar" los demás
- Diferencia entre "no cambies esto" vs "actualiza a null"

### Slug manual respetado

Si el usuario hace:
1. Crear producto: "Chef Knife" → slug auto genera "chef-knife"
2. Editar nombre: "Chef Knife Professional" → slug auto a "chef-knife-professional"
3. Editar slug manualmente: "pro-chef-8-inch"
4. Editar nombre nuevamente: "Pro Chef 10-inch" → slug se mantiene "pro-chef-8-inch"

El flag `slugModified` persiste mientras editas el formulario.
