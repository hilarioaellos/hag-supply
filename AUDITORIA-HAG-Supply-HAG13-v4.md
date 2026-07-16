# HAG Supply - Auditoria HAG-13 (v4)
**Fecha:** 16 julio 2026
**Scope:** Auth Login/Register/Guards - diff completo desde `c8d8a1a`
**Commit auditado:** `d3a9549`
**Veredicto:** GO
**`tsc --noEmit`:** PASS

---

## Veredicto

`d3a9549` resuelve los hallazgos que mantenian HAG-13 en `NO GO`.

En el commit auditado:
- ya no existe `findUnique` previo en register
- el email se normaliza con `trim().toLowerCase()` en register y login
- `withAuth` ya esta integrado en una route real (`/api/account/me`)

No vi blockers nuevos dentro del scope de HAG-13. Los pendientes restantes son endurecimiento para produccion, no razones para bloquear `GO`.

---

## Estado de los hallazgos del NO GO anterior

| # | Hallazgo previo | Estado en `d3a9549` |
|---|---|---|
| Mayor 1 | Race condition en register con email duplicado | Resuelto |
| Medio 1 | Email no normalizado entre register y login | Resuelto |
| Medio 2 | Guards declarados pero no integrados | Resuelto |
| Medio 3 | La auditoria previa describia mal `/account` | Corregido en esta v4 |

---

## Hallazgos resueltos

### Mayor 1 - Race condition en register con email duplicado

`app/api/auth/register/route.ts` ya no hace `findUnique` antes del `create`. El endpoint intenta crear directamente y captura `P2002` para devolver `400` controlado.

**Codigo del commit `d3a9549`:**

```ts
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
```

**Conclusion:** resuelto.

---

### Medio 1 - Email no normalizado entre register y login

Register normaliza el email:

```ts
const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;
```

Login tambien normaliza antes de buscar el usuario:

```ts
async authorize(credentials) {
  if (!credentials?.email || !credentials.password) return null;

  const normalizedEmail = credentials.email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (!user) return null;

  const valid = await bcrypt.compare(credentials.password, user.passwordHash);
  if (!valid) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role };
},
```

**Conclusion:** resuelto.

---

### Medio 2 - Guards declarados pero no integrados

`withAuth` ya no es helper muerto. En `d3a9549` esta aplicado en `app/api/account/me/route.ts`.

```ts
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
```

**Conclusion:** resuelto para el alcance HAG-13.

---

### Medio 3 - Estado real de `/account`

`/account` no devuelve `404` en el repo auditado. La ruta existe y esta protegida tanto por middleware como por chequeo server-side en la pagina.

**Conclusion:** corregido en esta auditoria.

---

## Verificaciones

```text
tsc --noEmit                                         -> PASS
curl /login                                          -> 200
curl /register                                       -> 200
curl /account (sin sesion)                           -> 307 -> /login
GET  /api/account/me (sin sesion)                    -> 401 {"error":"Unauthorized"}
POST /api/auth/register (campos vacios)              -> 400 {"error":"All fields are required."}
POST /api/auth/register (password < 8 chars)         -> 400 {"error":"Password must be at least 8 characters."}
```

---

## Pendientes no bloqueantes

- No hay rate limiting en `/api/auth/register`.
- No hay validacion formal de formato de email en el endpoint.
- `withAdmin` y `withOrderOwner` todavia no aparecen integrados en este commit, pero eso no bloquea HAG-13 porque el hallazgo original era que no habia ningun guard integrado.
- `NEXTAUTH_SECRET` debe estar configurado correctamente en el entorno desplegado.

---

## Conclusion

Para el alcance auditado en HAG-13, `d3a9549` pasa a `GO`.
