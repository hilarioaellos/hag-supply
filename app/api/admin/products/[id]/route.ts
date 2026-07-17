import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";

export const PATCH = withAdmin(async (req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };
  const body = await req.json();
  const {
    name,
    slug,
    description,
    sku,
    price,
    comparePrice,
    stock,
    imageUrls,
    badge,
    categoryId,
  } = body;

  const product = await db.product.findUnique({
    where: { id: params.id },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Check slug uniqueness if changed
  if (slug && slug !== product.slug) {
    const slugExists = await db.product.findFirst({
      where: { slug, id: { not: params.id }, deletedAt: null },
    });

    if (slugExists) {
      return NextResponse.json(
        { error: "Slug already exists" },
        { status: 400 }
      );
    }
  }

  // Check category exists if provided
  if (categoryId && categoryId !== product.categoryId) {
    const categoryExists = await db.category.findUnique({
      where: { id: categoryId },
    });

    if (!categoryExists) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }
  }

  const updated = await db.product.update({
    where: { id: params.id },
    data: {
      ...(name && { name }),
      ...(slug && { slug }),
      ...(description !== undefined && { description }),
      ...(sku !== undefined && { sku: sku || null }),
      ...(price !== undefined && { price: parseFloat(price) }),
      ...(comparePrice !== undefined && {
        comparePrice: comparePrice ? parseFloat(comparePrice) : null,
      }),
      ...(stock !== undefined && { stock: parseInt(stock) }),
      ...(imageUrls !== undefined && { imageUrls }),
      ...(badge !== undefined && { badge: badge || null }),
      ...(categoryId && { categoryId }),
    },
    include: { category: { select: { name: true } } },
  });

  return NextResponse.json(updated);
});

export const DELETE = withAdmin(async (req: NextRequest, context: unknown) => {
  const { params } = context as { params: { id: string } };
  const product = await db.product.findUnique({
    where: { id: params.id },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  await db.product.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });

  return NextResponse.json({ success: true });
});
