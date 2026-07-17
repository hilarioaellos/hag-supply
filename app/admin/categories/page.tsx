import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function CategoriesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[24px] font-bold text-hag-text">Categories</h1>

      <div className="bg-white border border-hag-border rounded-2xl p-8 text-center">
        <div className="text-[40px] mb-3">🏷️</div>
        <h2 className="text-[18px] font-bold text-hag-text mb-2">
          Categories Management (HAG-22)
        </h2>
        <p className="text-[14px] text-hag-text-2">
          CRUD for categories coming soon.
        </p>
      </div>
    </div>
  );
}
