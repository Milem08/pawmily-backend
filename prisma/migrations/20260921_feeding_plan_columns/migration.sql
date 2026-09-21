-- Align Feeding columns with Prisma schema (fixes appointment request 500)
ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "objective" TEXT;
ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "targetWeightKg" DOUBLE PRECISION;
ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "startDate" TEXT;
ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "reviewDate" TEXT;
ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
