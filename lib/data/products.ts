import { cache } from "react";
import { db } from "@/lib/db";
import { Prisma, ProductBadge } from "@prisma/client";

const PER_PAGE = 24;

export const getCategoryProducts = cache(
  async (
    slug: string,
    {
      page = 1,
      sort = "featured",
      badge,
      inStock,
    }: {
      page?: number;
      sort?: string;
      badge?: string;
      inStock?: boolean;
    }
  ) => {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      category: { slug },
      ...(badge ? { badge: badge as ProductBadge } : {}),
      ...(inStock ? { stock: { gt: 0 } } : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === "price-asc"
        ? { price: "asc" }
        : sort === "price-desc"
        ? { price: "desc" }
        : sort === "newest"
        ? { createdAt: "desc" }
        : { badge: "desc" }; // featured: badged items first (nulls last in desc)

    const [total, products, category] = await Promise.all([
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
        orderBy,
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
      }),
      db.category.findUnique({
        where: { slug },
        select: { name: true, slug: true, imageUrl: true },
      }),
    ]);

    return {
      category,
      products: products.map((p) => ({
        ...p,
        price: p.price.toString(),
        comparePrice: p.comparePrice?.toString() ?? null,
      })),
      total,
      totalPages: Math.ceil(total / PER_PAGE),
      page,
      perPage: PER_PAGE,
    };
  }
);

export const getProduct = cache(async (slug: string) => {
  try {
    const p = await db.product.findUnique({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        sku: true,
        price: true,
        comparePrice: true,
        imageUrls: true,
        badge: true,
        stock: true,
        category: { select: { name: true, slug: true } },
      },
    });
    if (!p) return null;
    return {
      ...p,
      price: p.price.toString(),
      comparePrice: p.comparePrice?.toString() ?? null,
    };
  } catch {
    return null;
  }
});

export const getRelatedProducts = cache(
  async (categorySlug: string, excludeSlug: string) => {
    try {
      const products = await db.product.findMany({
        where: {
          deletedAt: null,
          category: { slug: categorySlug },
          NOT: { slug: excludeSlug },
        },
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
        take: 4,
      });
      return products.map((p) => ({
        ...p,
        price: p.price.toString(),
        comparePrice: p.comparePrice?.toString() ?? null,
      }));
    } catch {
      return [];
    }
  }
);
