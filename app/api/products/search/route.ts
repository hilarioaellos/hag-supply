import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT));

  if (!q) {
    return NextResponse.json({ items: [], total: 0, page: 1, pages: 0 });
  }

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ],
    ...(category ? { category: { slug: category } } : {}),
  };

  const [total, items] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        comparePrice: true,
        imageUrls: true,
        badge: true,
        stock: true,
      },
      orderBy: { badge: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    items: items.map((p) => ({
      ...p,
      price: p.price.toString(),
      comparePrice: p.comparePrice?.toString() ?? null,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
