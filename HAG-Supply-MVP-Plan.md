# HAG Supply MVP — Plan Final

Stack: Next.js 14 App Router, PostgreSQL Railway, Prisma, Stripe, NextAuth.js, Resend.

---

## A. FUNCION COMPARTIDA: confirmOrder

Archivo: lib/confirm-order.ts
Tipo de retorno: 'confirmed' | 'already_processed' | 'oversell'

La funcion ejecuta un unico prisma.$transaction con cuatro pasos en este orden:

PASO 1 — Reclamar el estado PENDING_PAYMENT:
  order.updateMany WHERE id=orderId AND status=PENDING_PAYMENT
    SET status=PAYMENT_CONFIRMED
  Si rows updated = 0: lanzar error ALREADY_PROCESSED.
  La transaccion hace rollback. La orden no cambia. Retornar 'already_processed'.

PASO 2 — Cargar items de la orden dentro de la misma transaccion.

PASO 3 — Decrementar stock por cada item:
  product.updateMany WHERE id=item.productId AND stock >= item.quantity
    SET stock = stock - item.quantity
  Si rows updated = 0 en cualquier item: lanzar error OVERSELL.
  La transaccion hace rollback. El PASO 1 revierte: status vuelve a PENDING_PAYMENT.
  Retornar 'oversell'.

PASO 4 — Vaciar el carrito:
  cartItem.deleteMany WHERE userId=order.userId

COMMIT: si los cuatro pasos pasan, la transaccion persiste todo en una sola operacion atomica:
  - order.status = PAYMENT_CONFIRMED (del PASO 1)
  - product.stock decrementado por cada item (del PASO 3)
  - cartItems del usuario eliminados (del PASO 4)
Retornar 'confirmed'.

Manejo de errores fuera de la transaccion:
  - Error ALREADY_PROCESSED -> retornar 'already_processed'
  - Error OVERSELL:* -> retornar 'oversell'
  - Cualquier otro error (DB caida, timeout) -> relanzar. El caller responde 5xx.

El email de confirmacion se envia DESPUES del commit, fuera de la transaccion,
solo cuando la funcion retorna 'confirmed'. Esto garantiza un solo email y un solo
decremento sin importar que actor (webhook o checkout reconcile) llegue primero.

---

## B. SCHEMA PRISMA

Archivo: prisma/schema.prisma

Enums:
  Role: CUSTOMER, ADMIN
  ProductBadge: SALE, BEST_SELLER, NEW
  OrderStatus: PENDING_PAYMENT, PAYMENT_CONFIRMED, PROCESSING, SHIPPED, DELIVERED,
               CANCELLED, OVERSELL_REFUND_PENDING, OVERSELL_REFUND_FAILED, CANCELLED_REFUNDED

model User:
  id String @id @default(cuid())
  email String @unique
  passwordHash String
  name String
  role Role @default(CUSTOMER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  orders Order[]
  cartItems CartItem[]
  @@index([email])

model Category:
  id String @id @default(cuid())
  name String @unique
  slug String @unique
  imageUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  products Product[]
  @@index([slug])

model Product:
  id String @id @default(cuid())
  name String
  slug String @unique
  description String
  sku String? @unique
  price Decimal @db.Decimal(10,2)
  comparePrice Decimal? @db.Decimal(10,2)
  stock Int @default(0)
  imageUrls String[]
  badge ProductBadge?
  categoryId String
  category Category @relation(fields:[categoryId], references:[id])
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  cartItems CartItem[]
  orderItems OrderItem[]
  @@index([categoryId])
  @@index([slug])
  @@index([badge])
  @@index([deletedAt])

model CartItem:
  id String @id @default(cuid())
  userId String
  user User @relation(fields:[userId], references:[id])
  productId String
  product Product @relation(fields:[productId], references:[id])
  quantity Int
  addedAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([userId, productId])
  @@index([userId])

model Order:
  id String @id @default(cuid())
  orderNumber String @unique
  userId String
  user User @relation(fields:[userId], references:[id])
  buyerEmail String
  buyerName String
  status OrderStatus @default(PENDING_PAYMENT)
  subtotal Decimal @db.Decimal(10,2)
  shippingCost Decimal @db.Decimal(10,2) @default(0)
  total Decimal @db.Decimal(10,2)
  currency String @default("USD")
  shippingName String @default("")
  shippingLine1 String @default("")
  shippingLine2 String?
  shippingCity String @default("")
  shippingState String @default("")
  shippingZip String @default("")
  shippingCountry String @default("US")
  stripePaymentIntentId String? @unique
  stripeRefundId String?
  notes String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  items OrderItem[]
  @@index([userId])
  @@index([status])
  @@index([createdAt])
  @@index([updatedAt])

model OrderItem:
  id String @id @default(cuid())
  orderId String
  order Order @relation(fields:[orderId], references:[id])
  productId String
  product Product @relation(fields:[productId], references:[id])
  productName String
  productSku String?
  quantity Int
  unitPrice Decimal @db.Decimal(10,2)
  total Decimal @db.Decimal(10,2)
  @@index([orderId])
  @@index([productId])

Migracion SQL adicional (agregar manualmente al archivo generado por prisma migrate dev):

  CREATE UNIQUE INDEX "one_pending_per_user"
  ON "Order" ("userId")
  WHERE status = 'PENDING_PAYMENT';

Nota sobre nullabilidad:
  stripePaymentIntentId es nullable: la orden puede pasar a CANCELLED antes de crear PaymentIntent.
  stripeRefundId es nullable: se persiste al confirmar un reembolso en Stripe.

---

## C. FLUJO DE CHECKOUT

POST /api/checkout (requiere sesion autenticada)

1. Obtener carrito con items.
2. Validar carrito no vacio.
3. Calcular total server-side. Nunca del cliente.
4. Hard check: stock >= qty por item.
5. Buscar orden existente en PENDING_PAYMENT para este usuario.

CASO A: No existe orden en PENDING_PAYMENT.
  Ir al paso 6.

CASO B: Existe orden con stripePaymentIntentId no nulo.
  Consultar Stripe: paymentIntents.retrieve(stripePaymentIntentId).

  Si status = 'succeeded':
    No cancelar. El pago ya fue cobrado.
    Llamar confirmOrder(orderId) — misma funcion compartida.

    Si retorna 'confirmed':
      enviar email de confirmacion si aun no fue enviado
      redirigir a order-confirmation
      no crear nueva orden
      fin del flujo

    Si retorna 'already_processed':
      redirigir a order-confirmation
      no crear nueva orden
      fin del flujo

    Si retorna 'oversell':
      ejecutar inmediatamente el mismo flujo de oversell del webhook:
        - marcar orden OVERSELL_REFUND_PENDING si aplica
        - crear o reconciliar refund en Stripe
        - si refund exitoso: orden -> CANCELLED_REFUNDED
        - si refund falla: orden -> OVERSELL_REFUND_FAILED
      retornar error 409 al frontend:
        "The item became unavailable and your payment is being refunded."

  Si status = 'processing' o 'requires_capture':
    No cancelar. Retornar 409: "A payment is already being processed."

  Si status = 'requires_payment_method', 'requires_confirmation', 'canceled', 'requires_action':
    Marcar orden CANCELLED localmente.
    Cancelar PaymentIntent en Stripe.
    Ir al paso 6.

CASO C: Existe orden con stripePaymentIntentId nulo (PaymentIntent nunca fue creado).
  Marcar orden CANCELLED localmente.
  No hay nada que cancelar en Stripe.
  Ir al paso 6.

CASO D: Existe orden expirada (updatedAt < now()-30min) con stripePaymentIntentId.
  Aplicar la misma logica del CASO B antes de decidir si cancelar.

6. Crear nueva Order con status PENDING_PAYMENT.
7. Crear PaymentIntent en Stripe.
8. Si Stripe falla: marcar orden CANCELLED sincronicamente. Retornar 500.
9. Retornar clientSecret al frontend.

TTL: 30 minutos desde updatedAt (no createdAt). Limpieza lazy al iniciar checkout.

---

## D. FLUJO DE WEBHOOK STRIPE

POST /api/webhooks/stripe (sin sesion; verificacion por firma Stripe)

1. Verificar firma. Si falla: 400.
2. Filtrar solo event.type = 'payment_intent.succeeded'.
3. Buscar Order por stripePaymentIntentId.
4. Si status es terminal: retornar 200 sin procesar.
   Terminales: PAYMENT_CONFIRMED, PROCESSING, SHIPPED, DELIVERED,
               CANCELLED, CANCELLED_REFUNDED, OVERSELL_REFUND_FAILED
5. Si status = OVERSELL_REFUND_PENDING: ir al paso 7.
6. Si status = PENDING_PAYMENT:
   a. Llamar confirmOrder(orderId).
   b. Si 'confirmed': enviar email. Retornar 200.
   c. Si 'already_processed': retornar 200. (checkout reconcile ya proceso)
   d. Si 'oversell': ir al paso 7.
   e. Si excepcion transitoria: retornar 500. Stripe reintentara.
7. Flujo de oversell (compartido: mismo codigo ejecutado desde webhook y desde checkout reconcile):
   a. Actualizar orden a OVERSELL_REFUND_PENDING si no lo esta ya.

   b. Resolver idempotencia del refund SIN depender de buscar por idempotency key:
      Si order.stripeRefundId no es nulo:
        refund ya fue persistido localmente. No crear otro refund.
      Si order.stripeRefundId es nulo:
        buscar refunds en Stripe filtrando por payment_intent = stripePaymentIntentId.
        Revisar si ya existe un refund con metadata.orderId = order.id.
        Si existe un refund con metadata.orderId = order.id:
          persistir stripeRefundId localmente y no crear otro refund.
        Si no existe:
          crear refund en Stripe:
            stripe.refunds.create(
              {
                payment_intent: stripePaymentIntentId,
                metadata: {
                  orderId: order.id,
                  orderNumber: order.orderNumber
                }
              },
              {
                idempotencyKey: 'refund-{orderId}'
              }
            )

   c. Si refund fue creado o encontrado exitosamente:
      actualizar orden a CANCELLED_REFUNDED
      guardar stripeRefundId
      retornar 200

   d. Si refund falla:
      actualizar orden a OVERSELL_REFUND_FAILED
      enviar email al admin
      retornar 200

Politica HTTP:
  200: procesado o skip idempotente.
  5xx: fallo transitorio. Stripe reintenta.

---

## E. GUARDS DE AUTORIZACION

Archivo: lib/auth-guards.ts
Tres funciones que envuelven cada API route:

withAuth(handler):
  Obtener session. Si no hay session: retornar 401.
  Llamar handler(session). Retornar resultado.

withAdmin(handler):
  Obtener session. Si no hay session: retornar 401.
  Si session.user.role != ADMIN: retornar 403.
  Llamar handler(session). Retornar resultado.

withOrderOwner(orderId, handler):
  Obtener session. Si no hay session: retornar 401.
  Buscar order por id. Si no existe: retornar 404.
  Si order.userId != session.user.id Y role != ADMIN: retornar 403.
  Llamar handler(session, order). Retornar resultado.

Tabla de codigos HTTP:
  401: no autenticado
  403: sin permisos (rol o ownership)
  404: recurso no encontrado
  409: conflicto de estado (ej: categoría con productos, orden no en PENDING_PAYMENT)
  422: pago no confirmado en Stripe
  400: validacion de entrada
  500: error transitorio

Aplicacion por recurso:
  GET /api/orders/[id]: withOrderOwner
  GET /order-confirmation/[id] (page server): verificar ownership; notFound() si falla
  GET /account/orders: WHERE userId = session.user.id

---

## F. CONFIRM-PAYMENT MANUAL (Admin)

POST /api/admin/orders/[id]/confirm-payment (requiere withAdmin)

Boton visible en UI cuando: status=PENDING_PAYMENT, updatedAt>30min, stripePaymentIntentId no nulo.
(Solo orientacion de UX; la seguridad real es el step 2.)

1. Si orden no esta en PENDING_PAYMENT: retornar 409.
2. Consultar Stripe: paymentIntents.retrieve(stripePaymentIntentId).
3. Si status != 'succeeded': retornar 422.
4. Llamar confirmOrder(orderId). MISMA funcion compartida con el webhook.
5. Si 'confirmed': enviar email. Retornar 200.
6. Si 'already_processed': retornar 200.
7. Si 'oversell': iniciar flujo de oversell (igual que webhook paso 7). Retornar 200.

---

## G. MAQUINA DE ESTADOS

PENDING_PAYMENT -> PAYMENT_CONFIRMED (por confirmOrder via webhook o checkout reconcile)
PENDING_PAYMENT -> OVERSELL_REFUND_PENDING (por webhook, stock insuficiente)
PENDING_PAYMENT -> CANCELLED (solo por sistema de checkout, y solo desde este estado)
PAYMENT_CONFIRMED -> PROCESSING (por admin)
PROCESSING -> SHIPPED (por admin)
SHIPPED -> DELIVERED (por admin, terminal)
OVERSELL_REFUND_PENDING -> CANCELLED_REFUNDED (por webhook, refund exitoso, terminal)
OVERSELL_REFUND_PENDING -> OVERSELL_REFUND_FAILED (por webhook, refund fallido, terminal para wh)
CANCELLED_REFUNDED: terminal absoluto
CANCELLED: terminal absoluto

---

## H. OTRAS DECISIONES

| Tema | Decision |
|---|---|
| Carrito | Solo autenticado. Sin guest checkout. |
| Envio | $0. shippingCost en modelo para Phase 2. |
| Impuestos | Excluidos. total = subtotal. |
| Ambito | Solo US. |
| Imagenes | URLs externas. Sin upload. |
| Ambiente | Un solo ambiente Railway. |
| Email recovery | No en MVP. |
| Deals | Vista derivada: badge=SALE y comparePrice no nulo. No categoría en DB. |
| Borrado producto | Borrado logico con deletedAt. |
| Borrado categoria | 409 si tiene productos activos. |

orderNumber: formato HAG-YYYYMMDD-XXXXXXXX (8 chars alfanumericos con nanoid).
  36^8 combinaciones. @unique en DB. Reintentar hasta 3 veces si hay colision.

Design tokens: los OKLCh del mockup HTML se mapean a clases Tailwind hag-bg, hag-accent, etc.

---

## I. ESTRUCTURA DEL PROYECTO

app/(store)/page.tsx
app/(store)/category/[slug]/page.tsx
app/(store)/product/[slug]/page.tsx
app/(store)/search/page.tsx
app/(store)/deals/page.tsx
app/(store)/cart/page.tsx
app/(store)/checkout/page.tsx
app/(store)/order-confirmation/[id]/page.tsx
app/(store)/account/page.tsx
app/(store)/account/orders/page.tsx
app/(auth)/login/page.tsx
app/(auth)/register/page.tsx
app/admin/layout.tsx
app/admin/page.tsx
app/admin/products/page.tsx
app/admin/products/new/page.tsx
app/admin/products/[id]/edit/page.tsx
app/admin/categories/page.tsx
app/admin/orders/page.tsx
app/admin/orders/[id]/page.tsx
app/api/auth/[...nextauth]/route.ts
app/api/products/route.ts
app/api/products/[id]/route.ts
app/api/products/search/route.ts
app/api/cart/route.ts
app/api/checkout/route.ts
app/api/orders/route.ts
app/api/orders/[id]/route.ts
app/api/admin/products/route.ts
app/api/admin/products/[id]/route.ts
app/api/admin/categories/route.ts
app/api/admin/categories/[id]/route.ts
app/api/admin/orders/route.ts
app/api/admin/orders/[id]/route.ts
app/api/admin/orders/[id]/confirm-payment/route.ts
app/api/webhooks/stripe/route.ts
components/layout/ Header.tsx CategoryNav.tsx Footer.tsx
components/product/ ProductCard.tsx ProductGrid.tsx ProductDetail.tsx
components/cart/ AddToCartButton.tsx CartDrawer.tsx CartItem.tsx
components/checkout/ CheckoutForm.tsx ShippingForm.tsx StripePayment.tsx OrderSummary.tsx
components/ui/ Button.tsx Badge.tsx Input.tsx Modal.tsx Pagination.tsx Alert.tsx
lib/ db.ts stripe.ts auth.ts auth-guards.ts confirm-order.ts order-number.ts
middleware.ts
prisma/schema.prisma
prisma/seed.ts
public/logos/ hag-color.svg hag-blanco.svg hag-negro.svg
public/placeholder-product.svg

---

## J. CATEGORIAS

1. Home and Kitchen
2. Office Products
3. Sports and Outdoors
4. Pet Supplies
5. Toys
6. Automotive
7. Tools and Hardware
8. Industrial and Scientific
9. Patio and Garden
10. Cleaning Supplies
Deals and Offers: vista derivada, no categoria en DB.

---

## K. FASES

1. Setup: create-next-app, instalar prisma next-auth stripe bcryptjs nanoid resend, tailwind tokens, .env.
2. DB: schema.prisma, prisma migrate dev, SQL raw partial index, seed funcional.
3. Layout y UI: Header, CategoryNav, Footer, componentes ui.
4. Paginas publicas: Homepage, Category, Product, Search, Deals.
5. Auth: NextAuth CredentialsProvider bcrypt, Login, Register.
6. Carrito: AddToCartButton con redirect si no auth, CartDrawer, API CRUD.
7. Checkout y Stripe: ShippingForm, CheckoutForm, POST /api/checkout con consulta Stripe,
   StripePayment Elements, webhook con confirmOrder y oversell, email Resend, order-confirmation.
8. Admin: layout guard, dashboard con alertas OVERSELL_REFUND_FAILED, CRUD productos soft-delete,
   CRUD categorias 409, ordenes con confirm-payment.
9. Cuenta usuario: historial de ordenes filtrado por userId.

---

## L. VARIABLES DE ENTORNO

DATABASE_URL=postgresql://...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<32 chars>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
RESEND_API_KEY=re_...

---

## M. SEED

stock=0, stock=1, stock normal.
badge SALE con comparePrice, badge NEW, badge BEST_SELLER, sin badge.
imageUrls vacio (fallback), con 1 URL, con multiples URLs.
Una categoria con 3 productos y otra con 10+.
Ordenes: PAYMENT_CONFIRMED, SHIPPED, DELIVERED, CANCELLED.
Admin: admin@hagsupply.com / Admin1234! solo si NODE_ENV != production.

---

## N. VERIFICACION E2E

1. prisma migrate dev, SQL raw, prisma db seed. Verificar variedad en DB.
2. npm run dev. Homepage con datos reales.
3. Add to Cart sin login: redirect a login, post-login item en carrito.
4. Checkout: 4242424242424242. Orden PAYMENT_CONFIRMED. Email recibido.
5. stock=1: A compra, stock llega a 0. B ve out of stock.
6. Webhook duplicado: mismo PaymentIntentId dos veces. confirmOrder retorna
   already_processed en el segundo. Un solo email, un solo decremento.
7. Race checkout vs webhook: ambos llaman confirmOrder concurrentemente.
   Solo el primero obtiene claimed.count=1. El segundo obtiene 0 y sale.
   Un solo email. Un solo decremento.
8. Oversell: dos PaymentIntents sobre stock=1. Webhook del segundo detecta oversell.
   Refund automatico con idempotency key. stripeRefundId guardado. CANCELLED_REFUNDED.
9. CASO B-succeeded: PaymentIntent ya en succeeded en Stripe al iniciar checkout.
   confirmOrder llamado desde checkout. No se crea nueva orden.
10. CASO C: orden sin stripePaymentIntentId. Marcada CANCELLED. Nueva orden creada.
11. Abandono TTL: 31min despues. PaymentIntent no succeeded. Orden anterior CANCELLED. Nueva creada.
12. Admin: SHIPPED. Verificar en historial del usuario.
13. Admin CRUD: crear, editar, soft delete. No aparece en tienda.
14. Borrar categoria con productos: 409.
15. GET /api/orders/[id] con userId ajeno: 403.
16. Admin confirm-payment con PaymentIntent no succeeded: 422.
17. npm run build sin errores.
