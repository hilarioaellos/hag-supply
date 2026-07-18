import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// NextAuth reads NEXTAUTH_URL from env — not from authOptions.
// Railway's runtime v2 intermittently skips injecting custom vars,
// so we fall back to the always-available RAILWAY_PUBLIC_DOMAIN.
if (!process.env.NEXTAUTH_URL && process.env.RAILWAY_PUBLIC_DOMAIN) {
  process.env.NEXTAUTH_URL = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
