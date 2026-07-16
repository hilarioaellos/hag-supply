import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { withAuth } from "@/lib/auth-guards";
import { authOptions } from "@/lib/auth";

export const GET = withAuth(async (_req: NextRequest) => {
  const session = await getServerSession(authOptions);
  return NextResponse.json({
    id: session!.user.id,
    name: session!.user.name,
    email: session!.user.email,
    role: session!.user.role,
  });
});
