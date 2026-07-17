import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { CategoryForm } from "@/components/admin/CategoryForm";

export default async function NewCategoryPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-hag-text">Create Category</h1>
      <CategoryForm />
    </div>
  );
}
