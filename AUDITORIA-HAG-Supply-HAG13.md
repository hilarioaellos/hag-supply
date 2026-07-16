# HAG Supply — Auditoria HAG-13
**Fecha:** 16 julio 2026
**Scope:** Autenticación — Login, Register y guards
**Base aprobada:** c8d8a1a (HAG-12 fixes)
**Estado working tree:** sin commit (pendiente GO)
**`tsc --noEmit`:** PASS

---

## Qué se construyó

### Nuevo
1. `app/(auth)/layout.tsx` — layout mínimo sin header/footer para páginas de auth
2. `app/(auth)/register/page.tsx` — página de registro (Server Component, redirige si ya autenticado)
3. `components/auth/RegisterForm.tsx` — formulario de registro (Client Component, auto sign-in post-register)
4. `app/api/auth/register/route.ts` — POST endpoint de registro con validaciones
5. `lib/auth-guards.ts` — `withAuth`, `withAdmin`, `withOrderOwner` para API routes

### Modificado
6. `components/auth/LoginForm.tsx` — añadido link "Create account" → /register

### Ya existía (no modificado — incluido para contexto)
- `lib/auth.ts` — NextAuth options (CredentialsProvider, JWT, callbacks con id y role)
- `app/api/auth/[...nextauth]/route.ts` — handler NextAuth
- `app/(auth)/login/page.tsx` — página de login
- `middleware.ts` — protección de rutas /checkout, /account/*, /admin/*

---

## Verificaciones

```
tsc --noEmit                          → PASS
curl /login                           → 200
curl /register                        → 200
curl POST /api/auth/register {}       → 400 "All fields are required."
```

---

## Archivos nuevos o modificados

---

## app/(auth)/layout.tsx (nuevo)

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-hag-bg-alt flex flex-col">
      {children}
    </div>
  );
}
```

---

## app/(auth)/register/page.tsx (nuevo)

```tsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/RegisterForm";

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/account");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-hag-border bg-white p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)]">
        <div className="mb-8 flex flex-col gap-2">
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-hag-text-3">
            HAG Supply
          </span>
          <h1 className="text-3xl font-bold text-hag-text">Create your account</h1>
          <p className="text-sm text-hag-text-2">
            Start shopping — fast delivery, thousands of products.
          </p>
        </div>

        <RegisterForm />

        <p className="mt-6 text-center text-sm text-hag-text-2">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-hag-accent hover:text-hag-accent-dark transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
```

---

## components/auth/RegisterForm.tsx (nuevo)

```tsx
"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    // Auto sign-in after registration
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/account",
    });

    if (result?.error) {
      setError("Account created but sign-in failed. Please sign in manually.");
      router.push("/login");
      return;
    }

    router.push("/account");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && <Alert variant="error">{error}</Alert>}

      <Input
        label="Full name"
        name="name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <p className="text-[12px] text-hag-text-3">Minimum 8 characters.</p>

      <Button type="submit" size="lg" loading={submitting}>
        Create Account
      </Button>
    </form>
  );
}
```

---

## app/api/auth/register/route.ts (nuevo)

```typescript
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, password } = body ?? {};

  if (!name || !email || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.create({
    data: { name, email, passwordHash },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

---

## lib/auth-guards.ts (nuevo)

```typescript
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
```

---

## components/auth/LoginForm.tsx (modificado — añadido link "Create account")

Solo se muestra el bloque añadido al final del form, entre el botón y el cierre del `<form>`:

```tsx
      <p className="text-center text-sm text-hag-text-2">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-semibold text-hag-accent hover:text-hag-accent-dark transition-colors">
          Create account
        </Link>
      </p>
```

---

## Notas para el auditor

### Flujo de registro

1. `POST /api/auth/register` valida campos, longitud de password, email único → crea User con bcrypt(10)
2. `RegisterForm` llama al endpoint, y si es 201 ejecuta `signIn("credentials")` automáticamente
3. Si el auto sign-in falla (raro pero posible), redirige al usuario a `/login` con un mensaje claro
4. Éxito → redirect a `/account` (página que existe en HAG-24, por ahora muestra 404)

### Validaciones en el endpoint

- `name`, `email`, `password` presentes → 400 si falta alguno
- `password.length >= 8` → 400 si no cumple
- Email único → 400 si ya existe
- No se valida formato de email — el navegador lo hace vía `type="email"` en el input; para una API pública convendría agregar validación con zod, fuera del scope MVP

### withOrderOwner — dynamic import de db

`withOrderOwner` hace `await import("@/lib/db")` en runtime en lugar de import estático. Esto es intencional: si `withOrderOwner` no se usa en un API route dado, no se instancia el cliente de DB. No afecta el comportamiento — `lib/db.ts` usa un singleton con `globalThis`, así que el import dinámico devuelve la misma instancia que los imports estáticos.

### Redirect post-login

`login/page.tsx` redirige a `?redirect` si está presente, con sanitización (`getSafeCallbackUrl`): solo acepta paths que empiecen con `/` y no con `//` — previene open redirect hacia dominios externos.

### Pendiente conocido (fuera de scope HAG-13)

- `/account` devuelve 404 — se implementa en HAG-24
- No hay validación de formato de email en el API route (fuera de MVP)
- No hay rate limiting en `/api/auth/register` ni en NextAuth — pendiente antes de producción
