# HAG Supply — Código para Auditoría Externa
**Fecha:** 15 julio 2026  
**Versión:** MVP v1 — Setup, DB Schema, Auth, Layout & UI  
**Stack:** Next.js 16 · TypeScript · Tailwind v4 · Prisma 5 · NextAuth 4 · Stripe · bcryptjs · Resend

---

## Contexto del proyecto

Tienda en línea de catálogo propio (un solo vendedor). El comprador navega, agrega al carrito, paga con tarjeta vía Stripe y recibe confirmación por email. El admin gestiona productos, categorías y pedidos desde un panel protegido.

**Issues completados en esta fase:**
- HAG-1: Setup Next.js + Tailwind + TypeScript
- HAG-2: Dependencias del stack + singletons lib/
- HAG-3: Middleware de protección de rutas
- HAG-4: Schema Prisma completo
- HAG-6: Componentes UI base
- HAG-7: Header (logo, búsqueda, carrito, cuenta)
- HAG-8: CategoryNav + Footer
- CartProvider + CartDrawer (shell para HAG-14/15)

---

## prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  CUSTOMER
  ADMIN
}

enum ProductBadge {
  SALE
  BEST_SELLER
  NEW
}

enum OrderStatus {
  PENDING_PAYMENT
  PAYMENT_CONFIRMED
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
  OVERSELL_REFUND_PENDING
  OVERSELL_REFUND_FAILED
  CANCELLED_REFUNDED
}

model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  name         String
  role         Role       @default(CUSTOMER)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  orders       Order[]
  cartItems    CartItem[]

  @@index([email])
}

model Category {
  id        String    @id @default(cuid())
  name      String    @unique
  slug      String    @unique
  imageUrl  String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  products  Product[]

  @@index([slug])
}

model Product {
  id           String        @id @default(cuid())
  name         String
  slug         String        @unique
  description  String
  sku          String?       @unique
  price        Decimal       @db.Decimal(10, 2)
  comparePrice Decimal?      @db.Decimal(10, 2)
  stock        Int           @default(0)
  imageUrls    String[]
  badge        ProductBadge?
  categoryId   String
  category     Category      @relation(fields: [categoryId], references: [id])
  deletedAt    DateTime?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  cartItems    CartItem[]
  orderItems   OrderItem[]

  @@index([categoryId])
  @@index([slug])
  @@index([badge])
  @@index([deletedAt])
}

model CartItem {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  productId String
  product   Product  @relation(fields: [productId], references: [id])
  quantity  Int
  addedAt   DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, productId])
  @@index([userId])
}

model Order {
  id                    String      @id @default(cuid())
  orderNumber           String      @unique
  userId                String
  user                  User        @relation(fields: [userId], references: [id])
  buyerEmail            String
  buyerName             String
  status                OrderStatus @default(PENDING_PAYMENT)
  subtotal              Decimal     @db.Decimal(10, 2)
  shippingCost          Decimal     @default(0) @db.Decimal(10, 2)
  total                 Decimal     @db.Decimal(10, 2)
  currency              String      @default("USD")
  shippingName          String      @default("")
  shippingLine1         String      @default("")
  shippingLine2         String?
  shippingCity          String      @default("")
  shippingState         String      @default("")
  shippingZip           String      @default("")
  shippingCountry       String      @default("US")
  stripePaymentIntentId String?     @unique
  stripeRefundId        String?
  notes                 String?
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  items                 OrderItem[]

  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([updatedAt])
}

model OrderItem {
  id          String  @id @default(cuid())
  orderId     String
  order       Order   @relation(fields: [orderId], references: [id])
  productId   String
  product     Product @relation(fields: [productId], references: [id])
  productName String
  productSku  String?
  quantity    Int
  unitPrice   Decimal @db.Decimal(10, 2)
  total       Decimal @db.Decimal(10, 2)

  @@index([orderId])
  @@index([productId])
}
```

> **Nota:** El índice parcial `one_pending_per_user` no está en el schema — se agrega manualmente al SQL de migración:
> ```sql
> CREATE UNIQUE INDEX "one_pending_per_user"
> ON "Order" ("userId")
> WHERE status = 'PENDING_PAYMENT';
> ```

---

## middleware.ts

```typescript
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isProtectedRoute =
    pathname.startsWith("/checkout") || pathname.startsWith("/account");

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminRoute && token.role !== "ADMIN") {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/checkout", "/checkout/:path*", "/account/:path*", "/admin/:path*"],
};
```

---

## lib/db.ts

```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

---

## lib/auth.ts

```typescript
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { Role } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role as string };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
```

---

## lib/stripe.ts

```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia",
});
```

---

## types/next-auth.d.ts

```typescript
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      email: string;
      name: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
  }
}
```

---

## app/globals.css

```css
@import "tailwindcss";

@theme {
  --color-hag-bg:          oklch(99% 0.002 90);
  --color-hag-bg-alt:      oklch(96.5% 0.004 85);
  --color-hag-text:        oklch(19% 0.008 80);
  --color-hag-text-2:      oklch(46% 0.01 80);
  --color-hag-text-3:      oklch(62% 0.01 80);
  --color-hag-border:      oklch(89% 0.006 85);
  --color-hag-footer:      oklch(15% 0.006 260);
  --color-hag-accent:      oklch(52% 0.17 250);
  --color-hag-accent-dark: oklch(40% 0.15 250);
  --color-hag-accent-soft: oklch(94% 0.02 250);
  --color-hag-sale:        oklch(55% 0.18 25);
  --color-hag-star:        oklch(75% 0.14 85);

  --font-sans: 'Inter', system-ui, sans-serif;
}

body {
  background: var(--color-hag-bg);
  color: var(--color-hag-text);
  font-family: var(--font-sans);
  margin: 0;
}

a { color: inherit; }
```

---

## app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { CategoryNav } from "@/components/layout/CategoryNav";
import { Footer } from "@/components/layout/Footer";
import { CartProvider } from "@/components/cart/CartProvider";
import { CartDrawer } from "@/components/cart/CartDrawer";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HAG Supply",
  description: "Everything for your home — pantry, cleaning, décor, tools and garden.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-hag-bg">
        <CartProvider>
          <Header />
          <CategoryNav />
          <main className="flex-1">{children}</main>
          <Footer />
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
```

---

## components/ui/Button.tsx

```tsx
import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:   "bg-hag-accent text-white hover:bg-hag-accent-dark disabled:opacity-50",
  secondary: "border border-hag-border text-hag-text bg-transparent hover:bg-hag-bg-alt disabled:opacity-50",
  ghost:     "text-hag-text bg-transparent hover:bg-hag-bg-alt disabled:opacity-50",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary", size = "md", loading, disabled, children, className = "", ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
```

---

## components/ui/Badge.tsx

```tsx
import { ProductBadge } from "@prisma/client";

const styles: Record<ProductBadge, string> = {
  SALE:        "bg-hag-sale text-white",
  BEST_SELLER: "bg-hag-accent text-white",
  NEW:         "bg-emerald-500 text-white",
};

const labels: Record<ProductBadge, string> = {
  SALE:        "Sale",
  BEST_SELLER: "Best Seller",
  NEW:         "New",
};

export function Badge({ variant }: { variant: ProductBadge }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-700 ${styles[variant]}`}>
      {labels[variant]}
    </span>
  );
}
```

---

## components/ui/Input.tsx

```tsx
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-500 text-hag-text">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`h-10 rounded-lg border px-3 text-sm outline-none transition-colors bg-hag-bg text-hag-text placeholder:text-hag-text-3 ${
            error
              ? "border-hag-sale focus:ring-1 focus:ring-hag-sale"
              : "border-hag-border focus:border-hag-accent focus:ring-1 focus:ring-hag-accent"
          } ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-hag-sale">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
```

---

## components/ui/Modal.tsx

```tsx
"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function Modal({ open, onClose, children, title }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-hag-bg rounded-xl shadow-xl p-6 w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="text-lg font-700 text-hag-text mb-4">{title}</h2>}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-hag-text-3 hover:text-hag-text"
          aria-label="Close"
        >✕</button>
        {children}
      </div>
    </div>
  );
}
```

---

## components/ui/Pagination.tsx

```tsx
"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const visible = pages.filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  );

  return (
    <div className="flex items-center gap-1">
      <button
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text disabled:opacity-40 hover:bg-hag-bg-alt"
      >← Prev</button>

      {visible.map((page, i) => {
        const prev = visible[i - 1];
        const gap = prev && page - prev > 1;
        return (
          <span key={page} className="flex items-center gap-1">
            {gap && <span className="px-1 text-hag-text-3">…</span>}
            <button
              onClick={() => onPageChange(page)}
              className={`w-8 h-8 rounded text-sm font-500 ${
                page === currentPage
                  ? "bg-hag-accent text-white"
                  : "border border-hag-border text-hag-text hover:bg-hag-bg-alt"
              }`}
            >{page}</button>
          </span>
        );
      })}

      <button
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        className="px-3 py-1.5 rounded border border-hag-border text-sm text-hag-text disabled:opacity-40 hover:bg-hag-bg-alt"
      >Next →</button>
    </div>
  );
}
```

---

## components/ui/Alert.tsx

```tsx
"use client";

import { ReactNode, useState } from "react";

type AlertVariant = "info" | "warning" | "error" | "success";

const styles: Record<AlertVariant, string> = {
  info:    "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
};

const icons: Record<AlertVariant, string> = {
  info: "ℹ", warning: "⚠", error: "✕", success: "✓",
};

interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  dismissible?: boolean;
}

export function Alert({ variant = "info", children, dismissible }: AlertProps) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles[variant]}`}>
      <span className="mt-0.5 font-700">{icons[variant]}</span>
      <span className="flex-1">{children}</span>
      {dismissible && (
        <button onClick={() => setClosed(true)} className="opacity-60 hover:opacity-100">✕</button>
      )}
    </div>
  );
}
```

---

## components/layout/Header.tsx

```tsx
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { SearchBar } from "./SearchBar";
import { CartButton } from "./CartButton";

async function getCategories() {
  try {
    return await db.category.findMany({
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

export async function Header() {
  const categories = await getCategories();

  return (
    <header className="h-[92px] bg-hag-bg border-b border-hag-border flex items-center gap-9 px-12">
      <Link href="/" className="flex-none">
        <Image
          src="/logos/hag-color.svg"
          alt="HAG Supply"
          width={120}
          height={38}
          style={{ height: 38, width: "auto" }}
          priority
        />
      </Link>

      <SearchBar categories={categories} />

      <nav className="flex-none flex gap-7 ml-auto">
        <Link href="/account" className="flex flex-col items-center gap-0.5 text-hag-text hover:text-hag-accent transition-colors">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4 19c0-4 3.5-6.5 7-6.5s7 2.5 7 6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
          <span className="text-[11px] font-medium">Account</span>
        </Link>

        <button className="flex flex-col items-center gap-0.5 text-hag-text hover:text-hag-accent transition-colors">
          <span className="text-[20px] leading-none">♡</span>
          <span className="text-[11px] font-medium">Favorites</span>
        </button>

        <CartButton />
      </nav>
    </header>
  );
}
```

---

## components/layout/SearchBar.tsx

```tsx
"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface SearchBarProps {
  categories: { name: string; slug: string }[];
}

export function SearchBar({ categories }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const params = new URLSearchParams({ q: query.trim() });
    if (selectedCategory) params.set("category", selectedCategory);
    router.push(`/search?${params.toString()}`);
  }

  const categoryLabel = selectedCategory
    ? categories.find((c) => c.slug === selectedCategory)?.name ?? "All Categories"
    : "All Categories";

  return (
    <form
      onSubmit={submit}
      className="flex-1 max-w-[660px] h-[46px] border-[1.5px] border-hag-border rounded-lg flex items-center bg-hag-bg-alt overflow-hidden"
    >
      <div className="relative flex-none">
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-1.5 px-4 h-[46px] border-r border-hag-border text-hag-text-2 text-[13px] font-medium whitespace-nowrap hover:bg-hag-bg-alt transition-colors"
        >
          {categoryLabel}
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
            <polyline points="4,7 10,13 16,7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-52 bg-hag-bg border border-hag-border rounded-lg shadow-lg z-50 py-1">
            <button
              type="button"
              onClick={() => { setSelectedCategory(""); setDropdownOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-hag-text hover:bg-hag-bg-alt"
            >All Categories</button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => { setSelectedCategory(c.slug); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-hag-text hover:bg-hag-bg-alt"
              >{c.name}</button>
            ))}
          </div>
        )}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products, brands, and categories"
        className="flex-1 border-none outline-none bg-transparent text-[14px] text-hag-text px-4 placeholder:text-hag-text-3"
      />

      <button
        type="submit"
        className="flex-none h-full w-14 bg-hag-accent text-white flex items-center justify-center hover:bg-hag-accent-dark transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
          <line x1="14" y1="14" x2="18.5" y2="18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </form>
  );
}
```

---

## components/layout/CartButton.tsx

```tsx
"use client";

import { useCart } from "@/components/cart/CartProvider";

export function CartButton() {
  const { count, openDrawer } = useCart();

  return (
    <button
      onClick={openDrawer}
      className="flex flex-col items-center gap-0.5 text-hag-text cursor-pointer relative"
      aria-label="Open cart"
    >
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
        <rect x="4" y="7" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <line x1="7.5" y1="7" x2="7.5" y2="4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="14.5" y1="7" x2="14.5" y2="4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="19" r="1.3" fill="currentColor" />
        <circle cx="14" cy="19" r="1.3" fill="currentColor" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-2 bg-hag-accent text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5">
          {count > 99 ? "99+" : count}
        </span>
      )}
      <span className="text-[11px] font-medium">Cart</span>
    </button>
  );
}
```

---

## components/layout/CategoryNav.tsx

```tsx
import Link from "next/link";
import { db } from "@/lib/db";

async function getCategories() {
  try {
    return await db.category.findMany({
      select: { name: true, slug: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

export async function CategoryNav() {
  const categories = await getCategories();

  return (
    <nav className="h-[46px] bg-hag-bg border-b border-hag-border flex items-center gap-[30px] px-12 text-[14px] font-medium text-hag-text overflow-x-auto scrollbar-none">
      {categories.map((cat) => (
        <Link
          key={cat.slug}
          href={`/category/${cat.slug}`}
          className="whitespace-nowrap hover:text-hag-accent transition-colors"
        >
          {cat.name}
        </Link>
      ))}
      <Link
        href="/deals"
        className="whitespace-nowrap font-bold text-hag-accent-dark hover:text-hag-accent transition-colors"
      >
        Deals &amp; Offers
      </Link>
    </nav>
  );
}
```

---

## components/layout/Footer.tsx

```tsx
import Image from "next/image";
import Link from "next/link";

const CATEGORIES = [
  { name: "Home and Kitchen", slug: "home-and-kitchen" },
  { name: "Cleaning Supplies", slug: "cleaning-supplies" },
  { name: "Tools and Hardware", slug: "tools-and-hardware" },
  { name: "Patio and Garden", slug: "patio-and-garden" },
  { name: "Pet Supplies", slug: "pet-supplies" },
  { name: "Deals & Offers", slug: "/deals" },
];

const HELP = ["Track Your Order", "Shipping Info", "Returns & Exchanges", "FAQs"];
const POLICIES = ["Privacy Policy", "Terms of Service", "Accessibility"];

export function Footer() {
  return (
    <footer className="bg-hag-footer text-white/70">
      <div className="px-12 pt-14 pb-7">
        <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1.3fr] gap-8 pb-10 border-b border-white/10">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Categories</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              {CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link href={c.slug.startsWith("/") ? c.slug : `/category/${c.slug}`} className="hover:text-white transition-colors">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Help</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              {HELP.map((item) => (
                <li key={item}><span className="hover:text-white transition-colors cursor-pointer">{item}</span></li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Policies</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              {POLICIES.map((item) => (
                <li key={item}><span className="hover:text-white transition-colors cursor-pointer">{item}</span></li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Contact</p>
            <ul className="flex flex-col gap-[11px] text-[14px]">
              <li>1-800-555-0134</li>
              <li>support@hagsupply.com</li>
              <li>Mon–Fri, 8am–7pm ET</li>
            </ul>
          </div>

          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-white/45 mb-4">Newsletter</p>
            <p className="text-[13.5px] mb-3.5 leading-relaxed">Get weekly deals and new arrivals in your inbox.</p>
            <div className="flex border border-white/25 rounded-lg overflow-hidden">
              <input placeholder="Email address" className="flex-1 border-none bg-transparent text-white px-3 py-[11px] text-[13px] outline-none placeholder:text-white/40" />
              <button className="bg-hag-accent text-white border-none px-4 text-[13px] font-bold hover:bg-hag-accent-dark transition-colors">Sign Up</button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-6">
          <div className="flex items-center gap-3.5">
            <Image src="/logos/hag-blanco.svg" alt="HAG Supply" width={80} height={22} style={{ height: 22, width: "auto", opacity: 0.9 }} />
            <span className="text-[12.5px] text-white/45">© 2026 HAG Supply — A Division of HAG Partner LLC</span>
          </div>
          <div className="flex gap-2.5">
            {["f", "ig", "in", "x"].map((icon) => (
              <div key={icon} className="w-[30px] h-[30px] rounded-full border border-white/25 flex items-center justify-center text-[12px] font-semibold hover:border-white/50 transition-colors cursor-pointer">
                {icon}
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
```

---

## components/cart/CartProvider.tsx

```tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

interface CartItemData {
  id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    slug: string;
    price: string;
    imageUrls: string[];
    stock: number;
  };
}

interface CartContextValue {
  items: CartItemData[];
  count: number;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue>({
  items: [],
  count: 0,
  drawerOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
  refresh: async () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItemData[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/cart");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // silently fail if not authenticated
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        count,
        drawerOpen,
        openDrawer: () => setDrawerOpen(true),
        closeDrawer: () => setDrawerOpen(false),
        refresh,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
```

---

## components/cart/CartDrawer.tsx

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "./CartProvider";
import { Button } from "@/components/ui/Button";

export function CartDrawer() {
  const { items, drawerOpen, closeDrawer, refresh } = useCart();

  useEffect(() => {
    if (drawerOpen) refresh();
  }, [drawerOpen, refresh]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  const subtotal = items
    .reduce((sum, i) => sum + parseFloat(i.product.price) * i.quantity, 0)
    .toFixed(2);

  return (
    <>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={closeDrawer}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-[420px] bg-hag-bg z-50 shadow-2xl flex flex-col transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-hag-border">
          <h2 className="text-base font-700 text-hag-text">
            Your Cart {items.length > 0 && <span className="text-hag-text-3 font-400">({items.length})</span>}
          </h2>
          <button onClick={closeDrawer} className="text-hag-text-3 hover:text-hag-text text-lg">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <p className="text-hag-text-2">Your cart is empty.</p>
              <Button variant="secondary" onClick={closeDrawer} size="sm">Start Shopping</Button>
            </div>
          ) : (
            items.map((item) => {
              const img = item.product.imageUrls[0] ?? "/placeholder-product.svg";
              return (
                <div key={item.id} className="flex gap-3 items-start">
                  <Image
                    src={img}
                    alt={item.product.name}
                    width={64}
                    height={64}
                    className="rounded-lg object-cover border border-hag-border"
                  />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/product/${item.product.slug}`}
                      onClick={closeDrawer}
                      className="text-sm font-600 text-hag-text line-clamp-2 hover:text-hag-accent"
                    >
                      {item.product.name}
                    </Link>
                    <p className="text-sm text-hag-text-2 mt-0.5">
                      ${parseFloat(item.product.price).toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-700 text-hag-text whitespace-nowrap">
                    ${(parseFloat(item.product.price) * item.quantity).toFixed(2)}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="px-6 py-4 border-t border-hag-border flex flex-col gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-hag-text-2">Subtotal</span>
              <span className="font-700 text-hag-text">${subtotal}</span>
            </div>
            <p className="text-xs text-hag-text-3">🚚 Free shipping on all orders</p>
            <Link href="/checkout" onClick={closeDrawer}>
              <Button className="w-full">Proceed to Checkout</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={closeDrawer} className="w-full">
              Continue Shopping
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
```

---

## Variables de entorno (.env.example)

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
RESEND_API_KEY=re_...
```

---

## Dependencias (package.json)

```json
{
  "dependencies": {
    "@prisma/client": "^5.22.0",
    "@stripe/stripe-js": "^9.10.0",
    "@types/bcryptjs": "^2.4.6",
    "bcryptjs": "^3.0.3",
    "nanoid": "^6.0.0",
    "next": "16.2.10",
    "next-auth": "^4.24.14",
    "prisma": "^5.22.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "resend": "^6.17.2",
    "stripe": "^22.3.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "dotenv": "^17.4.2",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

---

*Fin del documento de auditoría — HAG Supply MVP v1*
