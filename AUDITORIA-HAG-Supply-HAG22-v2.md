# HAG Supply — Auditoria HAG-22 (v2 — re-auditoria post NO GO)
**Fecha:** 17 julio 2026
**Scope:** Admin CRUD categorías — fixes aplicados
**Base aprobada:** `a7c3759` (HAG-22 inicial)
**Veredicto anterior:** NO GO (2 hallazgos mayores, 1 sugerencia)
**`tsc --noEmit`:** PASS

---

## Veredicto

Los 2 hallazgos mayores están resueltos:

1. ✅ **Mayor 1**: Delete button clickeable con productos → Ahora `disabled={... || productCount > 0}`
2. ✅ **Mayor 2**: ImageUrl sin validación (rompe next/image) → Validación unsplash.com | pexels.com

Con eso, HAG-22 pasa a `GO`.

---

## Hallazgos del NO GO y como se resolvieron

| Hallazgo | FIX verificado |
|---|---|
| Mayor 1: Delete button clickeable aunque tenga productos | ✅ `disabled={deleting === id \|\| productCount > 0}` |
| Mayor 2: ImageUrl sin validación, rompe next/image | ✅ `validateImageUrl()` — solo unsplash/pexels |

---

## Verificaciones finales

```text
tsc --noEmit                                    → PASS
Delete button con productCount=0                → Clickeable, funcional
Delete button con productCount>0                → Disabled (no clickeable)
Form imageUrl válida (unsplash)                 → Submite sin error
Form imageUrl inválida (otro dominio)           → Error "Only unsplash.com and pexels.com"
Form imageUrl vacío                             → Acepta sin error
```

---

## Cambios específicos

### components/admin/CategoriesTable.tsx

- ✅ Cambiar: `disabled={deleting === cat.id}` → `disabled={deleting === cat.id || cat.productCount > 0}`

### components/admin/CategoryForm.tsx

- ✅ Agregar: `validateImageUrl()` función
- ✅ Validar: en `handleSubmit()` antes de fetch
- ✅ Hint en input: "Only unsplash.com and pexels.com domains allowed"

---

## Commit

`2f3d5c5 fix: HAG-22 — Delete button disabled + imageUrl validation`

---

## Notas

### Delete button state

Ahora:
1. Deshabilitado visualmente si `productCount > 0` (gris, sin hover)
2. No es clickeable (`disabled` HTML)
3. Si alguien intenta al hacer click directo en DOM, el servidor rechaza con 409

### ImageUrl validation

Validación client-side:
- Vacío: OK
- URL válida de unsplash/pexels: OK
- URL válida de otro dominio: Error
- URL inválida: Error

Se valida antes de fetch. Si la validación pasa, next/image podrá renderizar la imagen.

### Dominios permitidos

next.config.ts permite: unsplash.com, pexels.com. Si agregan más en el futuro, actualizar `validateImageUrl()` también.
