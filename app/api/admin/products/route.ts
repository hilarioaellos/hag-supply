import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";

export const GET = withAdmin(async (req: NextRequest) => {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const q = searchParams.get("q") || "";
  const limit = 20;
  const skip = (page - 1) * limit;

  const [products, total] = await Promise.all([
    db.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        price: true,
        stock: true,
        badge: true,
        deletedAt: true,
        category: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.product.count({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
    }),
  ]);

  return NextResponse.json({
    items: products,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

export const POST = withAdmin(async (req: NextRequest) => {
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

  if (!name || !slug || !price || stock === undefined || !categoryId) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const slugExists = await db.product.findFirst({
    where: { slug, deletedAt: null },
  });

  if (slugExists) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
  }

  const categoryExists = await db.category.findUnique({
    where: { id: categoryId },
  });

  if (!categoryExists) {
    return NextResponse.json(
      { error: "Category not found" },
      { status: 404 }
    );
  }

  const product = await db.product.create({
    data: {
      name,
      slug,
      description: description || "",
      sku: sku || null,
      price: parseFloat(price),
      comparePrice: comparePrice ? parseFloat(comparePrice) : null,
      stock: parseInt(stock),
      imageUrls: imageUrls || [],
      badge: badge || null,
      categoryId,
    },
    include: { category: { select: { name: true } } },
  });

  return NextResponse.json(product, { status: 201 });
});
