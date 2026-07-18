export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProductsTable } from "@/components/admin/ProductsTable";

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

async function getProducts(page: number, q: string) {
  const limit = 20;
  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    db.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        stock: true,
        badge: true,
        deletedAt: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.product.count({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
    }),
  ]);

  return {
    items: products.map((p) => ({
      ...p,
      price: p.price.toString(),
      deletedAt: p.deletedAt?.toISOString() || null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const q = params.q || "";

  const { items, total, pages } = await getProducts(page, q);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-bold text-hag-text">Products</h1>
        <Link href="/admin/products/new">
          <Button>Add Product</Button>
        </Link>
      </div>

      <div className="bg-white border border-hag-border rounded-2xl p-6">
        <form action="/admin/products" method="get" className="mb-6">
          <input
            type="text"
            name="q"
            placeholder="Search by name or SKU..."
            defaultValue={q}
            className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
          />
          <input type="hidden" name="page" value="1" />
        </form>

        <ProductsTable products={items} />

        {items.length === 0 && (
          <div className="text-center py-8 text-hag-text-2">
            No products found
          </div>
        )}

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {page > 1 && (
              <Link
                href={`/admin/products?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="px-3 py-1.5 rounded border border-hag-border text-[14px] text-hag-text hover:bg-hag-bg-alt"
              >
                â† Prev
              </Link>
            )}
            <span className="text-[14px] text-hag-text-2">
              Page {page} of {pages}
            </span>
            {page < pages && (
              <Link
                href={`/admin/products?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="px-3 py-1.5 rounded border border-hag-border text-[14px] text-hag-text hover:bg-hag-bg-alt"
              >
                Next â†’
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

