import Link from "next/link";
import { redirect } from "next/navigation";
import { searchProducts } from "@/lib/data/products";
import { getCategories } from "@/lib/data/categories";
import { ProductCard } from "@/components/product/ProductCard";
import { PageLinks } from "@/components/ui/PageLinks";
import { SearchFilters } from "./SearchFilters";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = String(sp.q || "").trim();
  const category = sp.category ? String(sp.category) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const [{ products, total, totalPages }, categories] = await Promise.all([
    q
      ? searchProducts(q, { page, category })
      : Promise.resolve({ products: [], total: 0, totalPages: 0, page: 1 }),
    getCategories(),
  ]);

  // Redirect out-of-range pages to page 1 instead of showing inconsistent state
  if (page > 1 && totalPages > 0 && page > totalPages) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    redirect(`/search?${params.toString()}`);
  }

  function buildHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (p > 1) params.set("page", String(p));
    return `/search?${params.toString()}`;
  }

  return (
    <div className="min-h-screen bg-hag-bg">
      {/* Search bar */}
      <div className="px-12 py-6 border-b border-hag-border bg-hag-bg-alt">
        <SearchFilters q={q} category={category} categories={categories} />
      </div>

      <div className="px-12 py-10">
        {/* Header */}
        {q ? (
          <div className="mb-7">
            <h1 className="text-[22px] font-bold text-hag-text">
              {total > 0 ? (
                <>
                  <span className="text-hag-text-2 font-normal">
                    {total} result{total !== 1 ? "s" : ""} for{" "}
                  </span>
                  &ldquo;{q}&rdquo;
                </>
              ) : (
                <>No results for &ldquo;{q}&rdquo;</>
              )}
            </h1>
            {category && (
              <p className="text-[13px] text-hag-text-2 mt-1">
                Filtered by category ·{" "}
                <Link
                  href={`/search?q=${encodeURIComponent(q)}`}
                  className="text-hag-accent hover:underline"
                >
                  Clear
                </Link>
              </p>
            )}
          </div>
        ) : (
          <div className="mb-7">
            <h1 className="text-[22px] font-bold text-hag-text">Search products</h1>
            <p className="text-[14px] text-hag-text-2 mt-1">
              Type a term above to search across all categories.
            </p>
          </div>
        )}

        {/* Results */}
        {products.length > 0 ? (
          <>
            <div className="grid grid-cols-4 gap-5">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <div className="mt-12 flex justify-center">
              <PageLinks currentPage={page} totalPages={totalPages} buildHref={buildHref} />
            </div>
          </>
        ) : q ? (
          <div className="py-24 flex flex-col items-center gap-3 text-center">
            <span className="text-[48px]">🔍</span>
            <p className="text-[17px] font-semibold text-hag-text">No products found</p>
            <p className="text-[14px] text-hag-text-2 max-w-[360px]">
              Try a different search term or browse by category.
            </p>
            <Link
              href="/"
              className="mt-3 px-5 py-2.5 rounded-lg bg-hag-accent text-white text-[14px] font-semibold hover:bg-hag-accent-dark transition-colors"
            >
              Back to Home
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
