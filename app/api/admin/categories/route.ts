import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";

export const GET = withAdmin(async () => {
  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });

  return NextResponse.json(
    categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      imageUrl: cat.imageUrl,
      productCount: cat._count.products,
    }))
  );
});

export const POST = withAdmin(async (req: NextRequest) => {
  const body = await req.json();
  const { name, slug, imageUrl } = body;

  if (!name || !slug) {
    return NextResponse.json(
      { error: "Name and slug required" },
      { status: 400 }
    );
  }

  const [nameExists, slugExists] = await Promise.all([
    db.category.findFirst({ where: { name } }),
    db.category.findFirst({ where: { slug } }),
  ]);

  if (nameExists) {
    return NextResponse.json(
      { error: "Category name already exists" },
      { status: 400 }
    );
  }

  if (slugExists) {
    return NextResponse.json(
      { error: "Category slug already exists" },
      { status: 400 }
    );
  }

  const category = await db.category.create({
    data: {
      name,
      slug,
      imageUrl: imageUrl || null,
    },
  });

  return NextResponse.json(category, { status: 201 });
});
