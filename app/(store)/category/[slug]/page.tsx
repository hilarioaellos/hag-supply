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
