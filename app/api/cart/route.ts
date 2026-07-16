import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withAuth } from "@/lib/auth-guards";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/cart — all cart items for the authenticated user
export const GET = withAuth(async (_req: NextRequest) => {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  const items = await db.cartItem.findMany({
    where: { userId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          imageUrls: true,
          stock: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { addedAt: "asc" },
  });

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      product: {
        ...item.product,
        price: item.product.price.toString(),
      },
    })),
  });
});

// POST /api/cart — add or replace item { productId, quantity }
export const POST = withAuth(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const body = await req.json();
  const { productId, quantity } = body ?? {};

  if (!productId || typeof quantity !== "number" || quantity < 1) {
    return NextResponse.json({ error: "productId and quantity >= 1 required." }, { status: 400 });
  }

  const product = await db.product.findUnique({
    where: { id: productId, deletedAt: null },
    select: { stock: true },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  if (quantity > product.stock) {
    return NextResponse.json(
      { error: `Only ${product.stock} unit${product.stock === 1 ? "" : "s"} available.` },
      { status: 400 }
    );
  }

  const item = await db.cartItem.upsert({
    where: { userId_productId: { userId, productId } },
    update: { quantity },
    create: { userId, productId, quantity },
  });

  return NextResponse.json({ id: item.id, quantity: item.quantity }, { status: 201 });
});

// PATCH /api/cart — update quantity { productId, quantity }
export const PATCH = withAuth(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const body = await req.json();
  const { productId, quantity } = body ?? {};

  if (!productId || typeof quantity !== "number" || quantity < 1) {
    return NextResponse.json({ error: "productId and quantity >= 1 required." }, { status: 400 });
  }

  const product = await db.product.findUnique({
    where: { id: productId, deletedAt: null },
    select: { stock: true },
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  if (quantity > product.stock) {
    return NextResponse.json(
      { error: `Only ${product.stock} unit${product.stock === 1 ? "" : "s"} available.` },
      { status: 400 }
    );
  }

  const existing = await db.cartItem.findUnique({
    where: { userId_productId: { userId, productId } },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Item not in cart." }, { status: 404 });
  }

  const item = await db.cartItem.update({
    where: { userId_productId: { userId, productId } },
    data: { quantity },
  });

  return NextResponse.json({ id: item.id, quantity: item.quantity });
});

// DELETE /api/cart?productId=xxx — remove specific item
export const DELETE = withAuth(async (req: NextRequest) => {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;
  const productId = req.nextUrl.searchParams.get("productId");

  if (!productId) {
    return NextResponse.json({ error: "productId query param required." }, { status: 400 });
  }

  await db.cartItem.deleteMany({ where: { userId, productId } });

  return NextResponse.json({ ok: true });
});
