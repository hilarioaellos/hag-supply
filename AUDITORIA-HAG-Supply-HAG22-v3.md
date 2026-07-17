# HAG Supply — Auditoria HAG-22 (v3 — re-auditoria final)
**Fecha:** 17 julio 2026
**Scope:** Admin CRUD categorías — validación imageUrl alineada con next.config
**Base aprobada:** `cd0aa88` (HAG-22-v2)
**Veredicto v2:** NO GO (imageUrl validación demasiado amplia)
**`tsc --noEmit`:** PASS

---

## Veredicto

Ambos hallazgos mayores están resueltos:

1. ✅ **Mayor 1** (v1): Delete button disabled cuando productCount > 0 → RESUELTO en v2
2. ✅ **Mayor 2** (v2): ImageUrl validación alineada con next.config.ts → RESUELTO en v3

Con eso, HAG-22 pasa a `GO`.

---

## Hallazgo v2 y como se resolvió

**Problema**: Validación aceptaba `unsplash.com`, `www.pexels.com` pero next.config solo permite:
- `images.unsplash.com/**`
- `images.pexels.com/photos/**`

**FIX (d549d72)**:

```typescript
const validateImageUrl = (url: string): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const pathname = parsed.pathname;

    // images.unsplash.com/... (any path)
    if (hostname === "images.unsplash.com") {
      return null;
    }

    // images.pexels.com/photos/... (must be /photos/)
    if (hostname === "images.pexels.com" && pathname.startsWith("/photos/")) {
      return null;
    }

    return `Image URL must be from images.unsplash.com or images.pexels.com/photos/`;
  } catch {
    return "Invalid image URL";
  }
};
```

---

## Verificaciones finales

```text
tsc --noEmit                                    → PASS
Form imageUrl: images.unsplash.com/photo...    → ACCEPT ✓
Form imageUrl: images.pexels.com/photos/123    → ACCEPT ✓
Form imageUrl: unsplash.com/...                 → REJECT ✗
Form imageUrl: www.pexels.com/...               → REJECT ✗
Form imageUrl: (empty)                          → ACCEPT ✓
Delete button productCount=0                    → Enabled ✓
Delete button productCount>0                    → Disabled ✓
```

---

## Commit

`d549d72 fix: HAG-22 — ImageUrl validación exacta`

---

## Notas finales

### Alineación form ↔ next.config

La validación ahora es **exacta** con next.config.ts:
```typescript
remotePatterns: [
  { protocol: "https", hostname: "images.unsplash.com" },
  { protocol: "https", hostname: "images.pexels.com", pathname: "/photos/**" },
]
```

Si agregan dominios a next.config, actualizar validateImageUrl() también.

### Hostname exacto

No `endsWith("unsplash.com")` sino `=== "images.unsplash.com"`. Evita:
- unsplash.com (sin images.)
- www.unsplash.com
- api.unsplash.com
- etc.

### Pathname obligatorio en pexels

Pexels tiene diferentes rutas: `/natures/`, `/food/`, `/photos/`, etc. next.config solo permite `/photos/`. La validación respeta eso.
