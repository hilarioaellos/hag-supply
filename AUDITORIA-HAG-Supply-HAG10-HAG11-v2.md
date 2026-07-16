# HAG Supply — Auditoria HAG-10 + HAG-11 (v2 — re-auditoría post NO GO)
**Fecha:** 16 julio 2026
**Scope:** Solo los 4 archivos modificados en respuesta al NO GO anterior
**Base:** commit 3f55c41 (HAG-11 original) → commit 89de374 (fixes)
**`tsc --noEmit`:** PASS
**`npx prisma db seed`:** PASS (7 categorías, sin ts-node)

---

## Hallazgos del NO GO y cómo se resolvieron

| # | Hallazgo original | Acción |
|---|---|---|
| Mayor 1 | `prisma.seed` apuntaba a `ts-node ... seed.ts`; ts-node no declarado en devDependencies | `package.json` cambiado a `node prisma/seed.js` |
| Mayor 1 (doc) | Auditoría anterior afirmaba que seed.ts "no se usa" cuando package.json lo invocaba | Consistencia resuelta: seed.js es el ejecutable oficial, seed.ts es referencia TypeScript |
| Sugerencia 1 | `getProduct` devolvía null en cualquier error de DB, generando 404 falsos | Removido el try/catch; errores de DB propagan a Next.js |
| Sugerencia 2 | seed.ts tenía 5 categorías, seed.js tenía 7 — inconsistencia documental | seed.ts actualizado a 7 categorías |
| Sugerencia 3 | Import no usado `AddToCartButton` en product/page.tsx | Import removido |

---

## Archivos modificados en esta revisión

---

## package.json (modificado — línea 24-26)

```json
{
  "name": "hag-supply",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "@stripe/stripe-js": "^9.10.0",
    "@types/bcryptjs": "^2.4.6",
    "bcryptjs": "^3.0.3",
    "nanoid": "^6.0.0",
    "next": "16.2.10",
    "next-auth": "^4.24.14",
    "prisma": "^5.22.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "resend": "^6.17.2",
    "stripe": "^22.3.1"
  },
  "prisma": {
    "seed": "node prisma/seed.js"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "dotenv": "^17.4.2",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

---

## prisma/seed.ts (modificado — ahora con 7 categorías, consistente con seed.js)

```typescript
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const categories = [
  { name: "Home and Kitchen", slug: "home-and-kitchen" },
  { name: "Cleaning Supplies", slug: "cleaning-supplies" },
  { name: "Tools and Hardware", slug: "tools-and-hardware" },
  { name: "Patio and Garden", slug: "patio-and-garden" },
  { name: "Pet Supplies", slug: "pet-supplies" },
  { name: "General Merchandise", slug: "general-merchandise" },
  { name: "Toys", slug: "toys" },
];

async function main() {
  console.log("Seeding categories...");
  for (const cat of categories) {
    await db.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    console.log(`  ✓ ${cat.name}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
```

---

## lib/data/products.ts (modificado — getProduct sin try/catch)

```typescript
import { cache } from "react";
import { db } from "@/lib/db";
import { Prisma, ProductBadge } from "@prisma/client";

const PER_PAGE = 24;

export const getCategoryProducts = cache(
  async (
    slug: string,
    {
      page = 1,
      sort = "featured",
      badge,
      inStock,
    }: {
      page?: number;
      sort?: string;
      badge?: string;
      inStock?: boolean;
    }
  ) => {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      category: { slug },
      ...(badge ? { badge: badge as ProductBadge } : {}),
      ...(inStock ? { stock: { gt: 0 } } : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === "price-asc"
        ? { price: "asc" }
        : sort === "price-desc"
        ? { price: "desc" }
        : sort === "newest"
        ? { createdAt: "desc" }
        : { badge: "desc" }; // featured: badged items first (nulls last in desc)

    const [total, products, category] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          comparePrice: true,
          imageUrls: true,
          badge: true,
          stock: true,
        },
        orderBy,
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
      }),
      db.category.findUnique({
        where: { slug },
        select: { name: true, slug: true, imageUrl: true },
      }),
    ]);

    return {
      category,
      products: products.map((p) => ({
        ...p,
        price: p.price.toString(),
        comparePrice: p.comparePrice?.toString() ?? null,
      })),
      total,
      totalPages: Math.ceil(total / PER_PAGE),
      page,
      perPage: PER_PAGE,
    };
  }
);

export const getProduct = cache(async (slug: string) => {
  const p = await db.product.findUnique({
    where: { slug, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      sku: true,
      price: true,
      comparePrice: true,
      imageUrls: true,
      badge: true,
      stock: true,
      category: { select: { name: true, slug: true } },
    },
  });
  if (!p) return null;
  return {
    ...p,
    price: p.price.toString(),
    comparePrice: p.comparePrice?.toString() ?? null,
  };
});

export const getRelatedProducts = cache(
  async (categorySlug: string, excludeSlug: string) => {
    try {
      const products = await db.product.findMany({
        where: {
          deletedAt: null,
          category: { slug: categorySlug },
          NOT: { slug: excludeSlug },
        },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          comparePrice: true,
          imageUrls: true,
          badge: true,
          stock: true,
        },
        orderBy: { badge: "desc" },
        take: 4,
      });
      return products.map((p) => ({
        ...p,
        price: p.price.toString(),
        comparePrice: p.comparePrice?.toString() ?? null,
      }));
    } catch {
      return [];
    }
  }
);
```

---

## app/(store)/product/[slug]/page.tsx (modificado — import AddToCartButton removido)

```tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getProduct, getRelatedProducts } from "@/lib/data/products";
import { Badge } from "@/components/ui/Badge";
import { ProductCard } from "@/components/product/ProductCard";
import { QuantitySelector } from "./QuantitySelector";

interface Props {
  params: Promise<{ slug: string }>;
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={i} width="16" height="16" viewBox="0 0 24 24" fill="none">
            {i < full ? (
              <polygon
                points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                fill="var(--color-hag-star)"
              />
            ) : i === full && half ? (
              <>
                <defs>
                  <linearGradient id={`half-${i}`}>
                    <stop offset="50%" stopColor="var(--color-hag-star)" />
                    <stop offset="50%" stopColor="var(--color-hag-border)" />
                  </linearGradient>
                </defs>
                <polygon
                  points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                  fill={`url(#half-${i})`}
                />
              </>
            ) : (
              <polygon
                points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                fill="var(--color-hag-border)"
              />
            )}
          </svg>
        ))}
      </div>
      <span className="text-[14px] font-semibold text-hag-text">{rating}</span>
      <span className="text-[14px] text-hag-text-2">({count} reviews)</span>
    </div>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product.category.slug, slug);

  const price = parseFloat(product.price);
  const comparePrice = product.comparePrice ? parseFloat(product.comparePrice) : null;
  const discount = comparePrice
    ? Math.round(((comparePrice - price) / comparePrice) * 100)
    : null;
  const mainImage = product.imageUrls[0] ?? null;
  const extraImages = product.imageUrls.slice(1);

  return (
    <div className="min-h-screen bg-hag-bg">
      {/* Breadcrumb */}
      <div className="px-12 py-4 border-b border-hag-border">
        <nav className="flex items-center gap-1.5 text-[13px] text-hag-text-2">
          <Link href="/" className="hover:text-hag-accent transition-colors">Home</Link>
          <span className="text-hag-border">/</span>
          <Link
            href={`/category/${product.category.slug}`}
            className="hover:text-hag-accent transition-colors"
          >
            {product.category.name}
          </Link>
          <span className="text-hag-border">/</span>
          <span className="text-hag-text font-medium line-clamp-1">{product.name}</span>
        </nav>
      </div>

      {/* Main product section */}
      <div className="px-12 py-10">
        <div className="grid grid-cols-[1fr_1fr] gap-16 max-w-[1100px]">
          {/* Images */}
          <div className="flex gap-3">
            {/* Thumbnail strip */}
            {extraImages.length > 0 && (
              <div className="flex flex-col gap-2 w-[72px] shrink-0">
                {product.imageUrls.map((url, i) => (
                  <div
                    key={i}
                    className={`relative h-[72px] rounded-lg overflow-hidden border-2 ${
                      i === 0 ? "border-hag-accent" : "border-hag-border"
                    }`}
                  >
                    <Image src={url} alt={`${product.name} ${i + 1}`} fill className="object-cover" sizes="72px" />
                  </div>
                ))}
              </div>
            )}

            {/* Main image */}
            <div className="flex-1 relative aspect-square rounded-2xl overflow-hidden bg-hag-bg-alt border border-hag-border">
              {mainImage ? (
                <Image
                  src={mainImage}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1200px) 50vw, 540px"
                  priority
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    background:
                      "repeating-linear-gradient(45deg, var(--color-hag-border), var(--color-hag-border) 10px, var(--color-hag-bg-alt) 10px, var(--color-hag-bg-alt) 20px)",
                  }}
                >
                  <span className="font-mono text-[13px] text-hag-text-2 bg-hag-bg px-3 py-1.5 rounded border border-hag-border">
                    No image
                  </span>
                </div>
              )}

              {/* Badge overlay */}
              {product.badge && (
                <div className="absolute top-4 left-4">
                  <Badge variant={product.badge} />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-5">
            {/* SKU */}
            {product.sku && (
              <p className="text-[12px] text-hag-text-3 font-mono">SKU: {product.sku}</p>
            )}

            {/* Name */}
            <h1 className="text-[28px] font-bold text-hag-text leading-snug">{product.name}</h1>

            {/* Rating — decorativo en MVP */}
            <StarRating rating={4.2} count={127} />

            {/* Price */}
            <div className="flex items-baseline gap-3">
              <span className="text-[32px] font-extrabold text-hag-text">${price.toFixed(2)}</span>
              {comparePrice && (
                <>
                  <span className="text-[18px] text-hag-text-3 line-through">${comparePrice.toFixed(2)}</span>
                  <span className="text-[13px] font-bold text-hag-sale bg-hag-sale/10 px-2 py-0.5 rounded">
                    -{discount}%
                  </span>
                </>
              )}
            </div>

            {/* Stock status */}
            <div className="flex items-center gap-2">
              {product.stock > 0 ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[13px] font-medium text-green-700">
                    In stock
                    {product.stock <= 10 && (
                      <span className="text-hag-sale ml-1">— only {product.stock} left</span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-hag-border" />
                  <span className="text-[13px] font-medium text-hag-text-3">Out of stock</span>
                </>
              )}
            </div>

            <div className="border-t border-hag-border" />

            {/* Quantity + Add to Cart */}
            <QuantitySelector productId={product.id} stock={product.stock} />

            {/* Description */}
            <div className="border-t border-hag-border pt-5">
              <p className="text-[13px] font-bold uppercase tracking-wider text-hag-text-2 mb-2">
                Description
              </p>
              <p className="text-[15px] text-hag-text-2 leading-relaxed">{product.description}</p>
            </div>

            {/* Trust badges */}
            <div className="flex gap-4 pt-1">
              {[
                { icon: "🚚", label: "Free shipping over $50" },
                { icon: "🔒", label: "Secure checkout" },
                { icon: "↩️", label: "30-day returns" },
              ].map((b) => (
                <div key={b.label} className="flex items-center gap-1.5 text-[12px] text-hag-text-2">
                  <span>{b.icon}</span>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Related Products */}
        {related.length > 0 && (
          <div className="mt-16 pt-10 border-t border-hag-border">
            <div className="flex items-baseline justify-between mb-7">
              <h2 className="text-[22px] font-bold text-hag-text">More from {product.category.name}</h2>
              <Link
                href={`/category/${product.category.slug}`}
                className="text-[14px] font-semibold text-hag-accent-dark hover:text-hag-accent transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-5">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Notas para el auditor

### Sobre getRelatedProducts — mantiene try/catch intencionalmente

`getRelatedProducts` conserva su `try/catch` y devuelve `[]` en caso de error. Es una sección secundaria de la página ("More from X") — si falla, la página de producto sigue siendo completamente funcional. Este es el comportamiento correcto: degradación silenciosa para contenido no crítico.

`getProduct` en cambio no tiene try/catch porque es el dato principal de la página. Si la DB falla, Next.js captura el error y muestra la pantalla de error apropiada en vez de un 404 falso.

### Verificaciones realizadas antes de enviar esta v2

```
npx tsc --noEmit          → sin errores
npx prisma db seed        → The seed command has been executed. (7 categorías ✓)
curl localhost:3000/product/chefs-knife-8-inch-professional → 200
```

### Pendiente conocido (fuera de scope HAG-10/HAG-11)

- Fallo de Google Fonts en build (Inter desde CDN externo en CI sin red) — identificado por el auditor como riesgo residual fuera de scope, no causa del NO GO.
- `AddToCartButton` es placeholder sin lógica de carrito real (HAG-14).
