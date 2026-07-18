export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getDealsProducts } from "@/lib/data/products";
import { ProductCard } from "@/components/product/ProductCard";
import { PageLinks } from "@/components/ui/PageLinks";

interface Props {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DealsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const { products, total, totalPages } = await getDealsProducts(page);

  // Redirect out-of-range pages to page 1
  if (page > 1 && totalPages > 0 && page > totalPages) {
    redirect("/deals");
  }

  function buildHref(p: number) {
    return p > 1 ? `/deals?page=${p}` : "/deals";
  }

  return (
    <div className="min-h-screen bg-hag-bg">
      {/* Header banner */}
      <div className="px-12 py-10 bg-hag-accent-dark text-white">
        <p className="text-[12px] font-bold uppercase tracking-widest text-white/70 mb-2">
          Limited-time savings
        </p>
        <h1 className="text-[36px] font-extrabold leading-tight mb-1">Deals &amp; Offers</h1>
        <p className="text-[15px] text-white/80">
          {total} product{total !== 1 ? "s" : ""} on sale right now — updated weekly.
        </p>
      </div>

      <div className="px-12 py-10">
        {products.length > 0 ? (
          <>
            <div className="grid grid-cols-4 gap-5">
              {products.map((product) => {
                const price = parseFloat(product.price);
                const compare = product.comparePrice ? parseFloat(product.comparePrice) : null;
                const savings = compare ? Math.round(((compare - price) / compare) * 100) : null;
                return (
                  <div key={product.id} className="relative">
                    {savings && (
                      <div className="absolute top-3 right-3 z-10 bg-hag-sale text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                        -{savings}%
                      </div>
                    )}
                    <ProductCard product={product} />
                  </div>
                );
              })}
            </div>
            <div className="mt-12 flex justify-center">
              <PageLinks currentPage={page} totalPages={totalPages} buildHref={buildHref} />
            </div>
          </>
        ) : (
          <div className="py-24 text-center">
            <p className="text-[17px] font-semibold text-hag-text">No deals available right now.</p>
            <p className="text-[14px] text-hag-text-2 mt-1">Check back soon — new offers every week.</p>
          </div>
        )}
      </div>
    </div>
  );
}
