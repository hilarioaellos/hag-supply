import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCategories } from "@/lib/data/categories";
import { ProductCard, type ProductCardData } from "@/components/product/ProductCard";
import { Decimal } from "@prisma/client/runtime/library";

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
            View all categories →
          </Link>
        </div>

        <div className="grid grid-cols-6 gap-5">
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

          {/* Deals card — siempre al final */}
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
