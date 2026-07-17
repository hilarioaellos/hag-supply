import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { CategoryForm } from "@/components/admin/CategoryForm";

export default async function EditCategoryPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  const category = await db.category.findUnique({
    where: { id: params.id },
  });

  if (!category) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-hag-text">Edit Category</h1>
      <CategoryForm
        category={{
          id: category.id,
          name: category.name,
          slug: category.slug,
          imageUrl: category.imageUrl,
        }}
      />
    </div>
  );
}
