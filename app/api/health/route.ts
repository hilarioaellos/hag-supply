import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const productCount = await db.product.count();
    const categoryCount = await db.category.count();
    const dbUrl = process.env.DATABASE_URL?.replace(/:([^@]+)@/, ":***@") ?? "NOT SET";

    return NextResponse.json({
      status: "ok",
      products: productCount,
      categories: categoryCount,
      dbUrl,
      nextauthUrl: process.env.NEXTAUTH_URL ?? "NOT SET",
      nodeEnv: process.env.NODE_ENV,
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      error: error.message,
      dbUrl: process.env.DATABASE_URL?.replace(/:([^@]+)@/, ":***@") ?? "NOT SET",
    }, { status: 500 });
  }
}
