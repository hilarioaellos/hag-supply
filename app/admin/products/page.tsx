import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProductsTable } from "@/components/admin/ProductsTable";

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const q = params.q || "";

  const res = await fetch(
    `${process.env.NEXTAUTH_URL}/api/admin/products?page=${page}&q=${encodeURIComponent(q)}`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch products");
  }

  const data = await res.json();
  const { items, total, pages } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-bold text-hag-text">Products</h1>
        <Link href="/admin/products/new">
          <Button>Add Product</Button>
        </Link>
      </div>

      <div className="bg-white border border-hag-border rounded-2xl p-6">
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search by name or SKU..."
            defaultValue={q}
            className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const query = (e.target as HTMLInputElement).value;
                const url = new URL(window.location.href);
                url.searchParams.set("q", query);
                url.searchParams.set("page", "1");
                window.location.href = url.toString();
              }
            }}
          />
        </div>

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
                ← Prev
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
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
