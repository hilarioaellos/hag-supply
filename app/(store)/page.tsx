export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCategories } from "@/lib/data/categories";
import { ProductCard, type ProductCardData } from "@/components/product/ProductCard";

const cardSelect = {
  id: true, name: true, slug: true, price: true,
  comparePrice: true, media: { select: { url: true, type: true, order: true }, orderBy: { order: "asc" as const } }, badge: true, stock: true,
};

// Destacados: los marcados con featured, más nuevos primero.
async function getFeaturedProducts(): Promise<ProductCardData[]> {
  try {
    const products = await db.product.findMany({
      where: { deletedAt: null, featured: true },
      select: cardSelect,
      take: 12,
      orderBy: { createdAt: "desc" },
    });

    return products.map((p) => ({
      ...p,
      price: p.price.toString(),
      comparePrice: p.comparePrice?.toString() ?? null,
    }));
  } catch (error) {
    console.error("[home] getFeaturedProducts failed:", error);
    return [];
  }
}

// Resto del catálogo (sin repetir los destacados): primero los que tienen badge.
async function getLatestProducts(): Promise<ProductCardData[]> {
  try {
    const products = await db.product.findMany({
      where: { deletedAt: null, featured: false },
      select: cardSelect,
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
  } catch (error) {
    console.error("[home] getLatestProducts failed:", error);
    return [];
  }
}

const BENEFITS = [
  {
    label: "Ships from Florida",
    desc: "Every order is packed and shipped from Florida, USA.",
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
    label: "Real Inventory",
    desc: "The stock you see is the stock we have on hand.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.6" />
        <line x1="7" y1="14" x2="11" y2="14" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    label: "New Products",
    desc: "Every item is new, as described on its page.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      </svg>
    ),
  },
];

export default async function HomePage() {
  const [categories, featured, latest] = await Promise.all([
    getCategories(),
    getFeaturedProducts(),
    getLatestProducts(),
  ]);

  return (
    <div>
      {/* HERO */}
      <section className="grid grid-cols-1 md:grid-cols-2" style={{ background: "var(--color-hag-accent-dark)", color: "white" }}>
        <div className="px-6 py-10 md:px-16 md:py-[24px] flex flex-col justify-center gap-5">
          <span className="uppercase tracking-[0.1em] text-[11px] font-bold text-white/60">
            Ships from Florida
          </span>
          <h1 className="m-0 text-[36px] md:text-[54px] leading-[1.08] font-extrabold text-white max-w-[560px]">
            Real products, in stock, shipped from Florida.
          </h1>
          <p className="m-0 text-[15px] md:text-[17px] leading-relaxed text-white/75 max-w-[460px]">
            A small, hand-picked selection of collectibles, kitchen finds and wellness essentials — every item listed is in our inventory.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-3">
            <Link
              href="#products"
              className="text-center px-[30px] py-[15px] rounded-lg bg-hag-accent text-[15px] font-bold shadow-lg hover:bg-hag-accent-dark transition-all"
              style={{ color: "white" }}
            >
              Shop Now
            </Link>
            <Link
              href="#categories"
              className="text-center px-[30px] py-[15px] rounded-lg bg-white/15 backdrop-blur-sm border border-white/50 text-white text-[15px] font-semibold hover:bg-white/25 transition-all"
            >
              Browse Categories
            </Link>
          </div>
        </div>
        <div className="hidden md:flex items-center justify-center min-h-[180px] relative overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1601600576337-c1d8a0d1373c?w=1200&q=85"
            alt="Tienda HAG Supply"
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--color-hag-accent-dark)/0 0%, var(--color-hag-accent)/20 100%)" }} />
        </div>
      </section>

      {/* SHOP BY CATEGORY */}
      <section id="categories" className="px-4 sm:px-6 lg:px-12 py-10 md:py-16 bg-hag-bg">
        <div className="flex items-baseline justify-between mb-7">
          <h2 className="m-0 text-[22px] md:text-[26px] font-bold text-hag-text">Shop by Category</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-5">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/category/${cat.slug}`}
              className="border border-hag-border rounded-[10px] overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="h-[120px] relative bg-hag-bg-alt flex items-center justify-center"
                style={{
                  background: cat.imageUrl
                    ? undefined
                    : "repeating-linear-gradient(45deg, var(--color-hag-border), var(--color-hag-border) 8px, var(--color-hag-bg-alt) 8px, var(--color-hag-bg-alt) 16px)",
                }}
              >
                {cat.imageUrl ? (
                  <Image src={cat.imageUrl} alt={cat.name} fill className="object-cover" sizes="(max-width: 768px) 100px, 200px" />
                ) : (
                  <span className="font-mono text-[10px] text-hag-text-3">photo</span>
                )}
              </div>
              <div className="px-3 py-3.5 text-[14px] font-semibold text-hag-text text-center">
                {cat.name}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURED PRODUCTS */}
      {featured.length > 0 && (
        <section id="featured" className="px-4 sm:px-6 lg:px-12 py-10 md:py-16 bg-hag-bg">
          <div className="mb-7">
            <h2 className="m-0 mb-1.5 text-[22px] md:text-[26px] font-bold text-hag-text">Featured Products</h2>
            <p className="m-0 text-[14px] md:text-[15px] text-hag-text-2">Hand-picked items from our own inventory.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-[18px]">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/* OUR PRODUCTS */}
      <section id="products" className="px-4 sm:px-6 lg:px-12 py-10 md:py-16 bg-hag-bg-alt">
        <div className="mb-7">
          <h2 className="m-0 mb-1.5 text-[22px] md:text-[26px] font-bold text-hag-text">Our Products</h2>
          <p className="m-0 text-[14px] md:text-[15px] text-hag-text-2">Everything we currently have in stock.</p>
        </div>

        {latest.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-[18px]">
            {latest.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-[18px]">
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
      <section className="px-4 sm:px-6 lg:px-12 py-10 md:py-[52px] bg-hag-bg border-t border-b border-hag-border grid grid-cols-1 sm:grid-cols-3 justify-items-center gap-6">
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
    </div>
  );
}
