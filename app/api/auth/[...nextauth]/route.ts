import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// NextAuth reads NEXTAUTH_URL from env — not from authOptions.
// Railway's runtime v2 intermittently skips injecting custom vars,
// so we fall back to RAILWAY_PUBLIC_DOMAIN (plain domain, no protocol).
if (!process.env.NEXTAUTH_URL && process.env.RAILWAY_PUBLIC_DOMAIN) {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN.replace(/^https?:\/\//, "").trim();
  if (domain) process.env.NEXTAUTH_URL = `https://${domain}`;
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
