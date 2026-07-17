import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Log all env vars available (hide values, show keys)
  const allKeys = Object.keys(process.env).sort();
  const dbUrl = process.env.DATABASE_URL?.replace(/:([^@]+)@/, ":***@") ?? "NOT SET";
  const nextauthSecret = process.env.NEXTAUTH_SECRET ? "SET" : "NOT SET";
  const nextauthUrl = process.env.NEXTAUTH_URL ?? "NOT SET";

  // Try DB connection
  let dbStatus = "not attempted";
  let dbError = null;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
    const count = await prisma.product.count();
    await prisma.$disconnect();
    dbStatus = `connected - ${count} products`;
  } catch (e: any) {
    dbError = e.message;
    dbStatus = "failed";
  }

  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    dbUrl,
    nextauthSecret,
    nextauthUrl,
    dbStatus,
    dbError,
    availableEnvKeys: allKeys,
  });
}
