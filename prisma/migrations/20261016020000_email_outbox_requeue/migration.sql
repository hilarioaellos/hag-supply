-- HAG-121: reencolado controlado de emails FAILED desde /admin (quién y cuándo). Aditiva.
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "requeueCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "requeuedAt" TIMESTAMP(3);
ALTER TABLE "EmailOutbox" ADD COLUMN IF NOT EXISTS "requeuedBy" TEXT;
