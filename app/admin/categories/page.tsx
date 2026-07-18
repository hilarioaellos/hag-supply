export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CategoriesTable } from "@/components/admin/CategoriesTable";

async function getCategories() {
  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });

  return categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    imageUrl: cat.imageUrl,
    productCount: cat._count.products,
  }));
}

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  const categories = await getCategories();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-bold text-hag-text">Categories</h1>
        <Link href="/admin/categories/new">
          <Button>Add Category</Button>
        </Link>
      </div>

      <div className="bg-white border border-hag-border rounded-2xl p-6">
        {categories.length === 0 ? (
          <div className="text-center py-8 text-hag-text-2">
            No categories found
          </div>
        ) : (
          <CategoriesTable categories={categories} />
        )}
      </div>
    </div>
  );
}

