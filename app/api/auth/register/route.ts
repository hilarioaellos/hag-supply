import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, password } = body ?? {};
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;

  if (!name || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await db.user.create({
      data: { name, email, passwordHash },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 400 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
