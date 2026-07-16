# HAG Supply - Auditoria HAG-13 (v3 - re-auditoria)
**Fecha:** 16 julio 2026
**Scope:** Autenticacion - Login, Register y guards
**Base aprobada:** c8d8a1a (HAG-12 fixes)
**Estado working tree:** sin commit (pendiente GO)
**Veredicto:** NO GO
**`tsc --noEmit`:** PASS

---

## Veredicto

HAG-13 no esta listo para `GO`.

El flujo base de autenticacion existe y compila, pero el estado actual sigue teniendo un fallo de robustez en el endpoint publico de registro y una diferencia clara entre el alcance documentado y lo que realmente esta integrado en el repo.

Esta v3 reemplaza documentos previos que mezclaban descripcion del avance con afirmaciones no alineadas al estado real del workspace.

---

## Hallazgos

### Mayor 1 - Registro vulnerable a condicion de carrera en email duplicado

`POST /api/auth/register` hace un `findUnique` previo y luego un `create`, pero no captura una violacion de constraint unica si dos requests intentan crear el mismo email casi al mismo tiempo.

Impacto:
- el caso esperado de "email ya existe" puede terminar en `500`
- el flujo principal de auth queda fragil en un endpoint publico
- el cliente no recibe una respuesta controlada en una condicion realista

**Referencia:** `app/api/auth/register/route.ts`

```ts
const existing = await db.user.findUnique({ where: { email } });
if (existing) {
  return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
}

const passwordHash = await bcrypt.hash(password, 10);
await db.user.create({
  data: { name, email, passwordHash },
});
```

**Estado:** NO resuelto

---

### Medio 1 - Email no normalizado entre register y login

El registro persiste `email` tal como llega y el login lo busca por igualdad exacta. No hay trim ni normalizacion de casing antes de guardar o autenticar.

Riesgo:
- cuentas creadas con espacios accidentales o casing inconsistente
- login fallando con un correo conceptualmente correcto
- errores de soporte dificiles de rastrear

**Referencias:** `app/api/auth/register/route.ts`, `lib/auth.ts`

```ts
const { name, email, password } = body ?? {};
```

```ts
const user = await db.user.findUnique({
  where: { email: credentials.email },
});
```

**Estado:** NO resuelto

---

### Medio 2 - Guards declarados pero no integrados

`lib/auth-guards.ts` forma parte del alcance documentado, pero en el estado actual del repo no hay evidencia de uso real de `withAuth`, `withAdmin` o `withOrderOwner` en route handlers.

Eso significa que:
- los guards existen como helpers
- pero todavia no son proteccion efectiva en runtime
- el alcance documentado sobredeclara el avance real

**Referencia:** `lib/auth-guards.ts`

```ts
export function withAuth(handler: Handler): Handler { ... }
export function withAdmin(handler: Handler): Handler { ... }
export function withOrderOwner(...) { ... }
```

**Estado:** NO integrado

---

### Medio 3 - La auditoria HAG-13 original documenta mal el estado de /account

La version anterior afirmaba que `/account` devolvia `404` y que se implementaba en HAG-24, pero la ruta ya existe y renderiza una pagina protegida.

Esto no rompe runtime, pero si rompe trazabilidad:
- induce validaciones sobre un estado incorrecto
- reduce la confiabilidad del documento como evidencia de aceptacion

**Referencias:** `AUDITORIA-HAG-Supply-HAG13.md`, `app/account/page.tsx`

```tsx
export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?redirect=/account");
  }
```

**Estado:** Documentacion inconsistente

---

## Verificaciones ejecutadas

```text
tsc --noEmit    -> PASS
```

Verificaciones faltantes para cerrar `GO`:
- registro exitoso end-to-end
- doble registro concurrente con el mismo email
- login exitoso post-register
- validacion funcional de guards aplicados en routes reales

---

## Estado real de /account

`app/account/page.tsx` existe en el repo actual, usa `getServerSession(authOptions)` y redirige a `/login?redirect=/account` si no hay sesion. No devuelve `404`.

El middleware tambien protege `/account/:path*`:

```ts
export const config = {
  matcher: ["/checkout", "/checkout/:path*", "/account/:path*", "/admin/:path*"],
};
```

---

## Archivos auditados

- `app/api/auth/[...nextauth]/route.ts`
- `app/api/auth/register/route.ts`
- `app/(auth)/layout.tsx`
- `app/(auth)/login/page.tsx`
- `app/(auth)/register/page.tsx`
- `app/account/page.tsx`
- `components/auth/LoginForm.tsx`
- `components/auth/RegisterForm.tsx`
- `components/auth/SignOutButton.tsx`
- `lib/auth.ts`
- `lib/auth-guards.ts`
- `middleware.ts`
- `types/next-auth.d.ts`
- `.env.local`
- `AUDITORIA-HAG-Supply-HAG13.md`
- `AUDITORIA-HAG-Supply-HAG13-v2.md`

---

## Notas

### Sobre NEXTAUTH_SECRET

En el workspace actual, `.env.local` tiene `NEXTAUTH_SECRET=` vacio.

No lo marco como hallazgo formal de codigo porque puede ser un estado local transitorio, pero si impide una validacion funcional confiable del flujo auth en este entorno si no se completa antes de probar.

### Sobre la pagina de login

`app/(auth)/login/page.tsx` si tiene sanitizacion basica de redirects con `getSafeCallbackUrl`, aceptando solo paths relativos validos y rechazando `//`.

### Sobre los guards

La presencia de `lib/auth-guards.ts` por si sola no alcanza para dar `GO` al alcance "guards". Hace falta ver integracion en routes efectivas o reducir el scope documentado.

---

## Condiciones para GO

HAG-13 puede pasar a `GO` cuando:

1. `app/api/auth/register/route.ts` maneje correctamente el caso de email duplicado tambien bajo carrera y devuelva error controlado en vez de `500`.
2. Register y login normalicen `email` de forma consistente.
3. El alcance de guards quede integrado en routes reales o se retire del scope documentado.
4. La documentacion de auditoria quede alineada con el estado real del repo.
