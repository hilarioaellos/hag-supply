-- Una sola orden PENDING_PAYMENT por usuario (plan MVP, sección B). Evita dos checkouts simultáneos
-- del mismo usuario creando dos órdenes y dos PaymentIntents. Prisma no modela índices parciales.
CREATE UNIQUE INDEX "one_pending_per_user" ON "Order" ("userId") WHERE status = 'PENDING_PAYMENT';
