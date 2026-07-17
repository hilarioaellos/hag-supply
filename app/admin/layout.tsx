import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  return (
    <div className="flex min-h-screen bg-hag-bg">
      <AdminSidebar />
      <main className="flex-1 flex flex-col">
        <div className="px-8 py-6 border-b border-hag-border">
          <div className="max-w-[1400px]">
            <h1 className="text-[28px] font-bold text-hag-text">Admin Panel</h1>
            <p className="text-[13px] text-hag-text-3 mt-1">
              {session.user.name || "Administrator"}
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="max-w-[1400px] mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
