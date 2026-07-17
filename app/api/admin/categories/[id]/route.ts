import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";

export const PATCH = withAdmin(async (req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };
  const body = await req.json();
  const { name, slug, imageUrl } = body;

  const category = await db.category.findUnique({
    where: { id: params.id },
  });

  if (!category) {
    return NextResponse.json(
      { error: "Category not found" },
      { status: 404 }
    );
  }

  // Check name uniqueness if changed
  if (name && name !== category.name) {
    const nameExists = await db.category.findFirst({
      where: { name, id: { not: params.id } },
    });

    if (nameExists) {
      return NextResponse.json(
        { error: "Category name already exists" },
        { status: 400 }
      );
    }
  }

  // Check slug uniqueness if changed
  if (slug && slug !== category.slug) {
    const slugExists = await db.category.findFirst({
      where: { slug, id: { not: params.id } },
    });

    if (slugExists) {
      return NextResponse.json(
        { error: "Category slug already exists" },
        { status: 400 }
      );
    }
  }

  const updated = await db.category.update({
    where: { id: params.id },
    data: {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withAdmin(async (req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };

  const category = await db.category.findUnique({
    where: { id: params.id },
    include: {
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });

  if (!category) {
    return NextResponse.json(
      { error: "Category not found" },
      { status: 404 }
    );
  }

  if (category._count.products > 0) {
    return NextResponse.json(
      {
        error: `This category has ${category._count.products} active product${
          category._count.products === 1 ? "" : "s"
        }. Delete or move products first.`,
      },
      { status: 409 }
    );
  }

  await db.category.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ success: true });
});
