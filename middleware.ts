import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");

  // No autenticado → login (aplica a todas las rutas del matcher)
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Autenticado pero sin rol ADMIN → 403 (no es falta de login, es falta de permiso)
  if (isAdminRoute && token.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/403", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/checkout", "/checkout/:path*", "/account/:path*", "/admin/:path*"],
};
