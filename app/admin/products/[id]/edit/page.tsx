export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProductForm } from "@/components/admin/ProductForm";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  const product = await db.product.findUnique({
    where: { id: params.id },
  });

  if (!product) {
    notFound();
  }

  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-hag-text">Edit Product</h1>
      <ProductForm
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          description: product.description,
          sku: product.sku,
          price: product.price.toString(),
          comparePrice: product.comparePrice?.toString() || null,
          stock: product.stock,
          imageUrls: product.imageUrls,
          badge: product.badge,
          categoryId: product.categoryId,
        }}
        categories={categories}
      />
    </div>
  );
}
