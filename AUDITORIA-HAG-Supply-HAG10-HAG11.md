# HAG Supply — Auditoria HAG-10 + HAG-11
**Fecha:** 16 julio 2026
**Scope:** Archivos nuevos o modificados en HAG-10 (página de categoría) y HAG-11 (página de producto)
**Base aprobada:** commit daedaf0 (HAG-9 homepage)
**Commits de esta sesión:** 06bea44 → 78a8c25 → 0dc1ebe → 7a08472 → 3f55c41

---

## Que se construyo

### HAG-10 — Página de categoría con filtros y paginación
1. `lib/data/products.ts` — query `getCategoryProducts` con filtros, sort y paginación server-side
2. `app/(store)/category/[slug]/page.tsx` — Server Component, lee searchParams async (Next.js 16 API)
3. `app/(store)/category/[slug]/CategoryFilters.tsx` — Client Component con sort, badge filter e in-stock toggle
4. `app/(store)/category/[slug]/CategoryPagination.tsx` — Server Component con Links (no callbacks)

### HAG-11 — Página de detalle de producto
5. `lib/data/products.ts` — funciones `getProduct` y `getRelatedProducts` añadidas al mismo archivo
6. `app/(store)/product/[slug]/page.tsx` — Server Component con imagen, SKU, rating, precio, stock, descripción y productos relacionados
7. `app/(store)/product/[slug]/QuantitySelector.tsx` — Client Component con selector −/+
8. `components/product/AddToCartButton.tsx` — Client Component placeholder (se conecta en HAG-14)

### Infraestructura / DB
9. `prisma/seed.js` — seed de 7 categorías (CommonJS, carga .env.local)
10. `prisma/seed-products.js` — seed de 70 productos (10 por categoría, con SKU, precio, badge, imagen Unsplash)
11. `package.json` — bloque `"prisma": { "seed": "..." }` añadido

---

## Archivos nuevos o modificados

---

## lib/data/products.ts (nuevo)

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
  try {
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
  } catch {
    return null;
  }
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

## app/(store)/category/[slug]/page.tsx (nuevo)

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { getCategoryProducts } from "@/lib/data/products";
import { ProductCard } from "@/components/product/ProductCard";
import { CategoryFilters } from "./CategoryFilters";
import { CategoryPagination } from "./CategoryPagination";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const sort = String(sp.sort || "featured");
  const badge = sp.badge ? String(sp.badge) : undefined;
  const inStock = sp.inStock === "true";

  const { category, products, total, totalPages } = await getCategoryProducts(slug, {
    page,
    sort,
    badge,
    inStock,
  });

  if (!category) notFound();

  return (
    <div className="min-h-screen bg-hag-bg">
      {/* Top bar */}
      <div className="px-12 py-5 border-b border-hag-border bg-hag-bg">
        <nav className="flex items-center gap-1.5 text-[13px] text-hag-text-2">
          <Link href="/" className="hover:text-hag-accent transition-colors">
            Home
          </Link>
          <span className="text-hag-border">/</span>
          <span className="text-hag-text font-medium">{category.name}</span>
        </nav>
      </div>

      <div className="px-12 py-10 flex gap-10 items-start">
        {/* Sidebar */}
        <aside className="w-[200px] shrink-0 sticky top-[80px]">
          <Suspense>
            <CategoryFilters
              currentSort={sort}
              currentBadge={badge}
              currentInStock={inStock}
            />
          </Suspense>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-baseline justify-between mb-7">
            <h1 className="text-[28px] font-bold text-hag-text">{category.name}</h1>
            <span className="text-[14px] text-hag-text-2">
              {total} {total === 1 ? "product" : "products"}
            </span>
          </div>

          {/* Grid */}
          {products.length === 0 ? (
            <div className="py-24 flex flex-col items-center gap-3 text-center">
              <span className="text-[42px]">🔍</span>
              <p className="text-[17px] font-semibold text-hag-text">No products found</p>
              <p className="text-[14px] text-hag-text-2">
                Try adjusting your filters or browse another category.
              </p>
              <Link
                href={`/category/${slug}`}
                className="mt-3 px-5 py-2.5 rounded-lg bg-hag-accent text-white text-[14px] font-semibold hover:bg-hag-accent-dark transition-colors"
              >
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-12 flex justify-center">
              <CategoryPagination
                currentPage={page}
                totalPages={totalPages}
                slug={slug}
                searchParams={Object.fromEntries(
                  Object.entries(sp).filter(([k]) => k !== "page")
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## app/(store)/category/[slug]/CategoryFilters.tsx (nuevo)

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

const BADGE_OPTIONS = [
  { value: "", label: "All" },
  { value: "SALE", label: "On Sale" },
  { value: "NEW", label: "New Arrivals" },
  { value: "BEST_SELLER", label: "Best Sellers" },
];

interface Props {
  currentSort: string;
  currentBadge?: string;
  currentInStock: boolean;
}

export function CategoryFilters({ currentSort, currentBadge, currentInStock }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Sort */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-hag-text-2 mb-3">
          Sort by
        </p>
        <div className="flex flex-col gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("sort", opt.value)}
              className={`text-left text-[14px] px-3 py-2 rounded-lg transition-colors ${
                currentSort === opt.value
                  ? "bg-hag-accent text-white font-semibold"
                  : "text-hag-text hover:bg-hag-bg-alt"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-hag-border" />

      {/* Badge filter */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-hag-text-2 mb-3">
          Product type
        </p>
        <div className="flex flex-col gap-1.5">
          {BADGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("badge", opt.value)}
              className={`text-left text-[14px] px-3 py-2 rounded-lg transition-colors ${
                (currentBadge ?? "") === opt.value
                  ? "bg-hag-accent text-white font-semibold"
                  : "text-hag-text hover:bg-hag-bg-alt"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-hag-border" />

      {/* In stock */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-hag-text-2 mb-3">
          Availability
        </p>
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <div
            onClick={() => update("inStock", currentInStock ? "" : "true")}
            className={`w-9 h-5 rounded-full relative transition-colors ${
              currentInStock ? "bg-hag-accent" : "bg-hag-border"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                currentInStock ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </div>
          <span className="text-[14px] text-hag-text">In stock only</span>
        </label>
      </div>
    </div>
  );
}
```

---

## app/(store)/category/[slug]/CategoryPagination.tsx (nuevo)

```tsx
import Link from "next/link";

interface Props {
  currentPage: number;
  totalPages: number;
  slug: string;
  searchParams: Record<string, string | string[] | undefined>;
}

function buildUrl(
  slug: string,
  searchParams: Record<string, string | string[] | undefined>,
  page: number
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k !== "page" && v) params.set(k, String(v));
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/category/${slug}${qs ? `?${qs}` : ""}`;
}

export function CategoryPagination({ currentPage, totalPages, slug, searchParams }: Props) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  );

  return (
    <div className="flex items-center gap-1">
      {currentPage > 1 && (
        <Link
          href={buildUrl(slug, searchParams, currentPage - 1)}
          className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text hover:bg-hag-bg-alt"
        >
          ← Prev
        </Link>
      )}

      {visible.map((page, i) => {
        const prev = visible[i - 1];
        const gap = prev && page - prev > 1;
        return (
          <span key={page} className="flex items-center gap-1">
            {gap && <span className="px-1 text-hag-text-3">…</span>}
            <Link
              href={buildUrl(slug, searchParams, page)}
              className={`w-8 h-8 flex items-center justify-center rounded text-sm ${
                page === currentPage
                  ? "bg-hag-accent text-white font-semibold"
                  : "border border-hag-border text-hag-text hover:bg-hag-bg-alt"
              }`}
            >
              {page}
            </Link>
          </span>
        );
      })}

      {currentPage < totalPages && (
        <Link
          href={buildUrl(slug, searchParams, currentPage + 1)}
          className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text hover:bg-hag-bg-alt"
        >
          Next →
        </Link>
      )}
    </div>
  );
}
```

---

## app/(store)/product/[slug]/page.tsx (nuevo)

```tsx
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getProduct, getRelatedProducts } from "@/lib/data/products";
import { Badge } from "@/components/ui/Badge";
import { ProductCard } from "@/components/product/ProductCard";
import { AddToCartButton } from "@/components/product/AddToCartButton";
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

## app/(store)/product/[slug]/QuantitySelector.tsx (nuevo)

```tsx
"use client";

import { useState } from "react";
import { AddToCartButton } from "@/components/product/AddToCartButton";

interface Props {
  productId: string;
  stock: number;
}

export function QuantitySelector({ productId, stock }: Props) {
  const [qty, setQty] = useState(1);
  const max = Math.min(stock, 10);

  return (
    <div className="flex flex-col gap-3">
      {stock > 0 && (
        <div className="flex items-center gap-3">
          <p className="text-[13px] font-semibold text-hag-text-2">Quantity</p>
          <div className="flex items-center border border-hag-border rounded-lg overflow-hidden">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              className="w-9 h-9 flex items-center justify-center text-[18px] text-hag-text hover:bg-hag-bg-alt disabled:opacity-40 transition-colors"
            >
              −
            </button>
            <span className="w-10 text-center text-[14px] font-semibold text-hag-text">
              {qty}
            </span>
            <button
              onClick={() => setQty((q) => Math.min(max, q + 1))}
              disabled={qty >= max}
              className="w-9 h-9 flex items-center justify-center text-[18px] text-hag-text hover:bg-hag-bg-alt disabled:opacity-40 transition-colors"
            >
              +
            </button>
          </div>
        </div>
      )}
      <AddToCartButton productId={productId} stock={stock} quantity={qty} />
    </div>
  );
}
```

---

## components/product/AddToCartButton.tsx (nuevo)

```tsx
"use client";

import { useState } from "react";

interface Props {
  productId: string;
  stock: number;
  quantity: number;
}

export function AddToCartButton({ stock, quantity }: Props) {
  const [added, setAdded] = useState(false);

  if (stock === 0) {
    return (
      <button
        disabled
        className="w-full py-4 rounded-xl text-[15px] font-semibold bg-hag-bg-alt text-hag-text-3 cursor-not-allowed"
      >
        Out of Stock
      </button>
    );
  }

  const handleClick = () => {
    // Cart API wired up in HAG-14
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <button
      onClick={handleClick}
      className="w-full py-4 rounded-xl text-[15px] font-bold bg-hag-accent text-white hover:bg-hag-accent-dark transition-colors active:scale-[0.98]"
    >
      {added ? "✓ Added to Cart" : `Add to Cart${quantity > 1 ? ` (${quantity})` : ""}`}
    </button>
  );
}
```

---

## Notas para el auditor

### Decisiones de diseño

1. **params y searchParams como Promise** — Next.js 16 requiere `await params` y `await searchParams` en Server Components. Se verificó en `node_modules/next/dist/docs/`.

2. **CategoryFilters envuelto en `<Suspense>`** — Requerido por Next.js cuando un Client Component usa `useSearchParams()` dentro de un Server Component padre. Sin Suspense, Next.js lanza error en build.

3. **CategoryPagination como Server Component** — Usa `<Link>` en vez de callbacks para que la paginación funcione sin JS y sea SEO-friendly.

4. **AddToCartButton como placeholder** — El componente tiene la interfaz final (`productId`, `stock`, `quantity`) pero la lógica de carrito se conecta en HAG-14. El botón muestra feedback visual ("✓ Added") para que el flujo sea evaluable.

5. **`featured` sort usa `{ badge: "desc" }`** — En PostgreSQL con Prisma, `desc` pone nulls last, así los productos con badge (SALE/NEW/BEST_SELLER) aparecen primero.

6. **`getProduct` y `getCategoryProducts` usan `React.cache()`** — Deduplicación automática si la misma query se llama múltiples veces en el mismo request (ej. layout + page).

### Pendiente / fuera de scope de esta auditoría

- `AddToCartButton` no tiene lógica real de carrito (HAG-14)
- Rating es decorativo hardcoded (reviews reales fuera del MVP)
- No hay carrusel de imágenes interactivo (los productos del seed tienen 1 imagen cada uno)
- `prisma/seed.ts` existe pero no se usa (se usa `seed.js` por compatibilidad con Node sin ts-node configurado)
