export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { UsersTable } from "@/components/admin/UsersTable";

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

async function getUsers(page: number, q: string) {
  const limit = 20;
  const skip = (page - 1) * limit;

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.user.count({ where }),
  ]);

  return {
    items: users.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export default async function UsersPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    notFound();
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const q = params.q || "";

  const { items, total, pages } = await getUsers(page, q);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-hag-text">Users</h1>
          <p className="text-[13px] text-hag-text-2 mt-1">{total} registered users</p>
        </div>
      </div>

      <div className="bg-white border border-hag-border rounded-2xl p-6">
        <form action="/admin/users" method="get" className="mb-6">
          <input
            type="text"
            name="q"
            placeholder="Search by name or email..."
            defaultValue={q}
            className="w-full px-4 py-2 border border-hag-border rounded-lg focus:outline-none focus:ring-2 focus:ring-hag-accent"
          />
          <input type="hidden" name="page" value="1" />
        </form>

        <UsersTable users={items} currentUserId={session.user.id} />

        {items.length === 0 && (
          <div className="text-center py-8 text-hag-text-2">No users found</div>
        )}

        {pages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {page > 1 && (
              <a
                href={`/admin/users?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="px-3 py-1.5 rounded border border-hag-border text-[14px] text-hag-text hover:bg-hag-bg-alt"
              >
                ← Prev
              </a>
            )}
            <span className="text-[14px] text-hag-text-2">
              Page {page} of {pages}
            </span>
            {page < pages && (
              <a
                href={`/admin/users?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="px-3 py-1.5 rounded border border-hag-border text-[14px] text-hag-text hover:bg-hag-bg-alt"
              >
                Next →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
