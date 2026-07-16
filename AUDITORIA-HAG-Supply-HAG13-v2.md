# HAG Supply - Auditoria HAG-13 (v2 - re-auditoria)
**Fecha:** 16 julio 2026
**Scope:** Autenticacion - Login, Register y guards
**Base aprobada:** c8d8a1a (HAG-12 fixes)
**Estado working tree:** sin commit (pendiente GO)
**Veredicto:** NO GO
**`tsc --noEmit`:** PASS

---

## Veredicto

HAG-13 no esta listo para `GO`.

El flujo base de autenticacion existe y compila, pero la entrega todavia tiene un fallo de robustez en el endpoint publico de registro y una brecha entre lo que la auditoria declara como entregado y lo que realmente esta integrado en el repo.

---

## Hallazgos

### Mayor 1 - Registro vulnerable a condicion de carrera en email duplicado

`POST /api/auth/register` hace un `findUnique` previo y luego un `create`, pero no captura el error de constraint unica si dos requests intentan crear el mismo email casi al mismo tiempo.

Resultado:
- el caso esperado de "email ya existe" puede terminar en `500`
- eso rompe el camino principal de auth en un endpoint publico
- no hay respuesta controlada para el cliente en una condicion perfectamente posible

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
- login fallando aunque el usuario "meta el mismo correo"
- soporte mas dificil por errores de entrada no evidentes

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

La entrega presenta `lib/auth-guards.ts` como parte del alcance de HAG-13, pero en el estado actual del repo no hay evidencia de uso real de `withAuth`, `withAdmin` o `withOrderOwner` en route handlers.

Eso significa que:
- los guards existen como helpers
- pero no constituyen proteccion efectiva todavia
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

La version anterior afirma que `/account` muestra `404` y que se implementa en HAG-24, pero la ruta ya existe y renderiza una pagina protegida.

Esto no rompe runtime, pero si rompe trazabilidad:
- induce a validar contra un estado incorrecto
- hace menos confiable el documento como fuente de aceptacion

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

Verificaciones pendientes para cerrar GO:
- registro exitoso end-to-end
- intento de doble registro concurrente con mismo email
- login exitoso post-register
- verificacion real de uso de guards en API routes

---

## Archivos auditados

- `app/api/auth/[...nextauth]/route.ts`
- `app/api/auth/register/route.ts`
- `app/(auth)/login/page.tsx`
- `app/(auth)/register/page.tsx`
- `app/(auth)/layout.tsx`
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

---

## Notas

### Sobre NEXTAUTH_SECRET

En el workspace actual, `.env.local` tiene `NEXTAUTH_SECRET=` vacio.

Eso no lo marco como hallazgo formal de codigo porque puede ser un estado local transitorio, pero si bloquea una validacion funcional confiable del flujo auth en este entorno si no se completa antes de probar.

### Sobre el login page

La pagina de login si tiene una proteccion razonable contra open redirect en `getSafeCallbackUrl`, aceptando solo redirects relativos validos.

### Sobre /account

`/account` si existe en el repo actual y hace chequeo server-side de sesion. La auditoria previa quedo desactualizada en ese punto.

---

## Condicion para GO

HAG-13 puede pasar a `GO` cuando:

1. `app/api/auth/register/route.ts` maneje correctamente el caso de email duplicado tambien bajo carrera y responda error controlado en vez de `500`.
2. Register y login normalicen `email` de forma consistente.
3. El alcance de guards quede integrado en routes reales o se retire del scope documentado.
4. La auditoria quede alineada con el estado real del repo.
