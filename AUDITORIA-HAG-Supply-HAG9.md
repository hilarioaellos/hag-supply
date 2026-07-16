# HAG Supply — Auditoria HAG-9
**Fecha:** 15 julio 2026
**Scope:** Solo los archivos nuevos o modificados en HAG-9
**Base aprobada:** v3 (commit 60b9c65)

---

## Que se construyo en HAG-9

1. Refactor de layout: root layout minimo + route group (store) con shell completo
2. lib/data/categories.ts — query deduplicada con React.cache()
3. components/product/ProductCard.tsx — tarjeta de producto
4. app/(store)/page.tsx — Homepage completa (5 secciones)
5. Fixes de mayores pendientes del audit v3:
   - SearchBar: dropdown cierra con click externo
   - next.config.ts: images.remotePatterns configurado
   - Header y CategoryNav: usan lib/data/categories.ts en vez de queries propias

---

## Archivos nuevos o modificados

---

## app/layout.tsx (modificado — era el root con shell, ahora es minimo)

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "HAG Supply", template: "%s | HAG Supply" },
  description: "Everything for your home — pantry, cleaning, decor, tools and garden.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-hag-bg">{children}</body>
    </html>
  );
}
```

---

## app/(store)/layout.tsx (nuevo)

```tsx
import { Header } from "@/components/layout/Header";
import { CategoryNav } from "@/components/layout/CategoryNav";
import { Footer } from "@/components/layout/Footer";
import { CartProvider } from "@/components/cart/CartProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <Header />
      <CategoryNav />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </CartProvider>
  );
}
```

---

## lib/data/categories.ts (nuevo)

```typescript
import { cache } from "react";
import { db } from "@/lib/db";

export const getCategories = cache(async () => {
  try {
    return await db.category.findMany({
      select: { name: true, slug: true, imageUrl: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
});
```

---

## components/layout/Header.tsx (modificado — elimina query propia)

```tsx
import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/lib/data/categories";
import { SearchBar } from "./SearchBar";
import { CartButton } from "./CartButton";

export async function Header() {
  const categories = await getCategories();

  return (
    <header className="h-[92px] bg-hag-bg border-b border-hag-border flex items-center gap-9 px-12">
      <Link href="/" className="flex-none">
        <Image
          src="/logos/hag-color.svg"
          alt="HAG Supply"
          width={120}
          height={38}
          style={{ height: 38, width: "auto" }}
          priority
        />
      </Link>

      <SearchBar categories={categories} />

      <nav className="flex-none flex gap-7 ml-auto">
        <Link href="/account" className="flex flex-col items-center gap-0.5 text-hag-text hover:text-hag-accent transition-colors">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4 19c0-4 3.5-6.5 7-6.5s7 2.5 7 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
          <span className="text-[11px] font-medium">Account</span>
        </Link>

        <button className="flex flex-col items-center gap-0.5 text-hag-text hover:text-hag-accent transition-colors">
          <span className="text-[20px] leading-none">&#9825;</span>
          <span className="text-[11px] font-medium">Favorites</span>
        </button>

        <CartButton />
      </nav>
    </header>
  );
}
```

---

## components/layout/CategoryNav.tsx (modificado — elimina query propia)

```tsx
import Link from "next/link";
import { getCategories } from "@/lib/data/categories";

export async function CategoryNav() {
  const categories = await getCategories();

  return (
    <nav className="h-[46px] bg-hag-bg border-b border-hag-border flex items-center gap-[30px] px-12 text-[14px] font-medium text-hag-text overflow-x-auto">
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          href={`/category/${cat.slug}`}
          className="whitespace-nowrap hover:text-hag-accent transition-colors"
        >
          {cat.name}
        </Link>
      ))}
      <Link
        href="/deals"
        className="whitespace-nowrap font-bold text-hag-accent-dark hover:text-hag-accent transition-colors"
      >
        Deals and Offers
      </Link>
    </nav>
  );
}
```

---

## components/layout/SearchBar.tsx (modificado — cierra dropdown con click externo)

```tsx
"use client";

import { useState, FormEvent, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface SearchBarProps {
  categories: { name: string; slug: string }[];
}

export function SearchBar({ categories }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const params = new URLSearchParams({ q: query.trim() });
    if (selectedCategory) params.set("category", selectedCategory);
    router.push(`/search?${params.toString()}`);
  }

  const categoryLabel = selectedCategory
    ? categories.find((c) => c.slug === selectedCategory)?.name ?? "All Categories"
    : "All Categories";

  return (
    <form
      onSubmit={submit}
      className="flex-1 max-w-[660px] h-[46px] border-[1.5px] border-hag-border rounded-lg flex items-center bg-hag-bg-alt overflow-hidden"
    >
      <div className="relative flex-none" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-1.5 px-4 h-[46px] border-r border-hag-border text-hag-text-2 text-[13px] font-medium whitespace-nowrap hover:bg-hag-bg-alt transition-colors"
        >
          {categoryLabel}
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
            <polyline points="4,7 10,13 16,7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-hag-bg border border-hag-border rounded-lg shadow-lg z-50 py-1">
            <button
              type="button"
              onClick={() => { setSelectedCategory(""); setDropdownOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-hag-text hover:bg-hag-bg-alt"
            >
              All Categories
            </button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => { setSelectedCategory(c.slug); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-hag-text hover:bg-hag-bg-alt"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products, brands, and categories"
        className="flex-1 border-none outline-none bg-transparent text-[14px] text-hag-text px-4 placeholder:text-hag-text-3"
      />

      <button
        type="submit"
        className="flex-none h-full w-14 bg-hag-accent text-white flex items-center justify-center hover:bg-hag-accent-dark transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
          <line x1="14" y1="14" x2="18.5" y2="18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
```

---

## next.config.ts (modificado — agrega images.remotePatterns)

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
  },
};

export default nextConfig;
```

---

## components/product/ProductCard.tsx (nuevo)

```tsx
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ProductBadge } from "@prisma/client";

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  price: string;
  comparePrice?: string | null;
  imageUrls: string[];
  badge?: ProductBadge | null;
  stock: number;
}

function StarRating() {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[12px] text-hag-star">****</span>
      <span className="text-[12px] text-hag-border">*</span>
      <span className="text-[12px] text-hag-text-3">(-)</span>
    </div>
  );
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const img = product.imageUrls[0] ?? "/placeholder-product.svg";
  const price = parseFloat(product.price);
  const comparePrice = product.comparePrice ? parseFloat(product.comparePrice) : null;

  return (
    <div className="bg-hag-bg border border-hag-border rounded-[10px] p-3.5 flex flex-col gap-2 relative">
      {product.badge && (
        <div className="absolute top-[22px] left-[22px] z-10">
          <Badge variant={product.badge} />
        </div>
      )}

      <Link href={`/product/${product.slug}`} className="block">
        <div className="relative h-[150px] rounded-lg overflow-hidden bg-hag-bg-alt"
          style={!product.imageUrls[0] ? {
            background: "repeating-linear-gradient(45deg, var(--color-hag-border), var(--color-hag-border) 8px, var(--color-hag-bg-alt) 8px, var(--color-hag-bg-alt) 16px)"
          } : undefined}
        >
          <Image
            src={img}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 200px"
          />
        </div>
      </Link>

      <Link
        href={`/product/${product.slug}`}
        className="text-[14px] font-semibold text-hag-text leading-snug hover:text-hag-accent transition-colors line-clamp-2"
      >
        {product.name}
      </Link>

      <StarRating />

      <div className="flex items-baseline gap-2">
        <span className="text-[17px] font-bold text-hag-text">${price.toFixed(2)}</span>
        {comparePrice && (
          <span className="text-[13px] text-hag-text-3 line-through">${comparePrice.toFixed(2)}</span>
        )}
      </div>

      {product.stock === 0 ? (
        <button
          disabled
          className="mt-1 w-full py-2.5 rounded-[7px] text-[13px] font-semibold bg-hag-bg-alt text-hag-text-3 cursor-not-allowed"
        >
          Out of Stock
        </button>
      ) : (
        <Link
          href={`/product/${product.slug}`}
          className="mt-1 w-full py-2.5 rounded-[7px] text-[13px] font-semibold bg-hag-accent text-white text-center hover:bg-hag-accent-dark transition-colors"
        >
          Add to Cart
        </Link>
      )}
    </div>
  );
}
```

---

## app/(store)/page.tsx (nuevo — Homepage completa)

```tsx
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCategories } from "@/lib/data/categories";
import { ProductCard, type ProductCardData } from "@/components/product/ProductCard";

async function getFeaturedProducts(): Promise<ProductCardData[]> {
  try {
    const products = await db.product.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, slug: true, price: true,
        comparePrice: true, imageUrls: true, badge: true, stock: true,
      },
      take: 24,
      orderBy: { createdAt: "desc" },
    });

    const badged = products.filter((p) => p.badge !== null);
    const unbadged = products.filter((p) => p.badge === null);
    const sorted = [...badged, ...unbadged].slice(0, 12);

    return sorted.map((p) => ({
      ...p,
      price: p.price.toString(),
      comparePrice: p.comparePrice?.toString() ?? null,
    }));
  } catch {
    return [];
  }
}

const BENEFITS = [
  {
    label: "Fast Shipping",
    desc: "Most orders arrive in 2-4 business days.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 10h3l3 3v3h-6z" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="7" cy="18" r="1.6" fill="currentColor" />
        <circle cx="18" cy="18" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    label: "Everything for Your Home",
    desc: "One store for pantry, cleaning, tools and more.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    ),
  },
  {
    label: "Secure Checkout",
    desc: "Encrypted payments, every order protected.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    ),
  },
  {
    label: "Weekly Deals",
    desc: "New savings on essentials every week.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.6" />
        <line x1="7" y1="14" x2="11" y2="14" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    label: "Customer Support",
    desc: "Real people, ready to help 7 days a week.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 10a3 3 0 1 1 4 2.8V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        <circle cx="13" cy="17" r="0.9" fill="currentColor" />
      </svg>
    ),
  },
];

export default async function HomePage() {
  const [categories, featured] = await Promise.all([
    getCategories(),
    getFeaturedProducts(),
  ]);

  return (
    <div>
      {/* HERO */}
      <section className="grid grid-cols-2 bg-hag-bg-alt">
        <div className="px-16 py-[76px] flex flex-col justify-center gap-5">
          <span className="uppercase tracking-[0.08em] text-[12px] font-bold text-hag-accent-dark">
            Trusted by households and businesses nationwide
          </span>
          <h1 className="m-0 text-[52px] leading-[1.08] font-extrabold text-hag-text max-w-[560px]">
            Everything your home needs, delivered fast.
          </h1>
          <p className="m-0 text-[17px] leading-relaxed text-hag-text-2 max-w-[460px]">
            Pantry staples, cleaning supplies, tools, decor and outdoor gear — one reliable source, thousands of products in stock.
          </p>
          <div className="flex gap-3.5 mt-3">
            <Link
              href="/category/home-and-kitchen"
              className="px-[30px] py-[15px] rounded-lg bg-hag-accent text-white text-[15px] font-semibold hover:bg-hag-accent-dark transition-colors"
            >
              Shop Now
            </Link>
            <Link
              href="#categories"
              className="px-[30px] py-[15px] rounded-lg border-[1.5px] border-hag-border text-hag-text text-[15px] font-semibold hover:bg-hag-bg transition-colors"
            >
              Browse Categories
            </Link>
          </div>
        </div>
        <div
          className="flex items-center justify-center min-h-[520px]"
          style={{
            background:
              "repeating-linear-gradient(45deg, var(--color-hag-border), var(--color-hag-border) 12px, var(--color-hag-bg-alt) 12px, var(--color-hag-bg-alt) 24px)",
          }}
        >
          <span className="font-mono text-[13px] text-hag-text-2 bg-hag-bg px-3.5 py-2 rounded-md border border-hag-border">
            lifestyle photo — home, tools and garden essentials
          </span>
        </div>
      </section>

      {/* SHOP BY CATEGORY */}
      <section id="categories" className="px-12 py-16 bg-hag-bg">
        <div className="flex items-baseline justify-between mb-7">
          <h2 className="m-0 text-[26px] font-bold text-hag-text">Shop by Category</h2>
          <Link href="/category/home-and-kitchen" className="text-[14px] font-semibold text-hag-accent-dark hover:text-hag-accent transition-colors">
            View all categories
          </Link>
        </div>

        <div className="grid grid-cols-6 gap-5">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              className="border border-hag-border rounded-[10px] overflow-hidden hover:shadow-md transition-shadow"
            >
              <div
                className="h-[120px] relative bg-hag-bg-alt flex items-center justify-center"
                style={!cat.imageUrl ? {
                  background: "repeating-linear-gradient(45deg, var(--color-hag-border), var(--color-hag-border) 8px, var(--color-hag-bg-alt) 8px, var(--color-hag-bg-alt) 16px)"
                } : undefined}
              >
                {cat.imageUrl ? (
                  <Image src={cat.imageUrl} alt={cat.name} fill className="object-cover" sizes="200px" />
                ) : (
                  <span className="font-mono text-[10px] text-hag-text-3">photo</span>
                )}
              </div>
              <div className="px-3 py-3.5 text-[14px] font-semibold text-hag-text text-center">
                {cat.name}
              </div>
            </Link>
          ))}

          <Link
            href="/deals"
            className="border-[1.5px] border-hag-accent rounded-[10px] overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="h-[120px] bg-hag-accent-soft flex items-center justify-center">
              <span className="font-mono text-[10px] text-hag-accent-dark">photo</span>
            </div>
            <div className="px-3 py-3.5 text-[14px] font-bold text-hag-accent-dark text-center">
              Deals and Offers
            </div>
          </Link>
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      <section className="px-12 py-16 bg-hag-bg-alt">
        <div className="mb-7">
          <h2 className="m-0 mb-1.5 text-[26px] font-bold text-hag-text">Featured Products</h2>
          <p className="m-0 text-[15px] text-hag-text-2">Popular picks across the store, restocked weekly.</p>
        </div>

        {featured.length > 0 ? (
          <div className="grid grid-cols-6 gap-[18px]">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-[18px]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-hag-bg border border-hag-border rounded-[10px] p-3.5 flex flex-col gap-2">
                <div className="h-[150px] rounded-lg bg-hag-bg-alt animate-pulse" />
                <div className="h-4 bg-hag-bg-alt rounded animate-pulse" />
                <div className="h-3 bg-hag-bg-alt rounded w-2/3 animate-pulse" />
                <div className="h-5 bg-hag-bg-alt rounded w-1/2 animate-pulse" />
                <div className="h-9 bg-hag-bg-alt rounded animate-pulse mt-1" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BENEFITS */}
      <section className="px-12 py-[52px] bg-hag-bg border-t border-b border-hag-border flex justify-between gap-6">
        {BENEFITS.map((b) => (
          <div key={b.label} className="flex flex-col items-center text-center gap-2.5 max-w-[200px]">
            <div className="w-[52px] h-[52px] rounded-full bg-hag-accent-soft flex items-center justify-center text-hag-accent-dark">
              {b.icon}
            </div>
            <p className="text-[14px] font-bold text-hag-text m-0">{b.label}</p>
            <p className="text-[12.5px] text-hag-text-2 leading-relaxed m-0">{b.desc}</p>
          </div>
        ))}
      </section>

      {/* PROMO BLOCK */}
      <section className="grid grid-cols-[1.1fr_1fr] bg-hag-accent-dark text-white">
        <div className="px-16 py-16 flex flex-col justify-center gap-4">
          <span className="uppercase tracking-[0.08em] text-[12px] font-bold text-white/75">
            Seasonal Savings Event
          </span>
          <h2 className="m-0 text-[38px] font-extrabold leading-[1.15] max-w-[480px]">
            Everything for Your Home, in One Place
          </h2>
          <p className="m-0 text-[15.5px] leading-relaxed text-white/85 max-w-[440px]">
            Save on top categories this month — from patio essentials to power tools.
          </p>
          <Link
            href="/deals"
            className="mt-2 self-start px-7 py-3.5 rounded-lg bg-white text-hag-accent-dark text-[15px] font-bold hover:bg-white/90 transition-colors"
          >
            Shop Now
          </Link>
        </div>
        <div
          className="flex items-center justify-center min-h-[360px]"
          style={{
            background:
              "repeating-linear-gradient(45deg, rgba(255,255,255,0.08), rgba(255,255,255,0.08) 12px, rgba(255,255,255,0.02) 12px, rgba(255,255,255,0.02) 24px)",
          }}
        >
          <span className="font-mono text-[12px] text-white/70 border border-white/30 px-3.5 py-2 rounded-md">
            seasonal offer photo
          </span>
        </div>
      </section>
    </div>
  );
}
```

---

## Puntos abiertos conocidos (heredados de v3, sin cambios)

| # | Descripcion | Se resuelve en |
|---|-------------|----------------|
| 1 | CartProvider llama /api/cart al montar aunque el usuario no este autenticado | HAG-14 |
| 2 | CartDrawer calcula precios con parseFloat sobre strings | HAG-14 |
| 3 | Modal sin focus trap | Antes de HAG-13 |
| 4 | ProductCard: "Add to Cart" es un Link al producto, no un boton real | HAG-14 (AddToCartButton) |

---

*Fin del documento - HAG Supply HAG-9*
