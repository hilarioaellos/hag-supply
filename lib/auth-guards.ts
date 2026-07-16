import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

type Handler = (req: NextRequest, context?: unknown) => Promise<NextResponse>;

export function withAuth(handler: Handler): Handler {
  return async (req, context) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req, context);
  };
}

export function withAdmin(handler: Handler): Handler {
  return async (req, context) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(req, context);
  };
}

export function withOrderOwner(
  getOrderId: (req: NextRequest) => string,
  handler: Handler
): Handler {
  return async (req, context) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { db } = await import("@/lib/db");
    const orderId = getOrderId(req);
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (order.userId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return handler(req, context);
  };
}
