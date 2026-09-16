-- Clinical consultations, feeding meals/logs, favorites, avatar

CREATE SEQUENCE IF NOT EXISTS consultation_number_seq START 1;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "photoAssetId" TEXT;

ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'pet';

ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "consultationNumber" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "time" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "ownerName" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "responsibleName" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "medication" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "results" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "observations" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "privateNotes" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "typePayload" JSONB;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "followUpTime" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "relatedConsultationId" TEXT;
ALTER TABLE "MedicalRecord" ADD COLUMN IF NOT EXISTS "followUpAppointmentId" TEXT;

UPDATE "MedicalRecord"
SET "consultationNumber" = 'CONS-' || LPAD(nextval('consultation_number_seq')::text, 6, '0')
WHERE "consultationNumber" IS NULL;

ALTER TABLE "MedicalRecord" ALTER COLUMN "consultationNumber" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "MedicalRecord_consultationNumber_key" ON "MedicalRecord"("consultationNumber");
CREATE INDEX IF NOT EXISTS "MedicalRecord_type_idx" ON "MedicalRecord"("type");

DO $$ BEGIN
  ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_relatedConsultationId_fkey"
    FOREIGN KEY ("relatedConsultationId") REFERENCES "MedicalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_followUpAppointmentId_fkey"
    FOREIGN KEY ("followUpAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "allowedFoods" TEXT;
ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "forbiddenFoods" TEXT;

CREATE TABLE IF NOT EXISTS "FeedingMeal" (
  "id" TEXT NOT NULL,
  "feedingId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "amount" TEXT,
  "food" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "FeedingMeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeedingMeal_feedingId_idx" ON "FeedingMeal"("feedingId");
DO $$ BEGIN
  ALTER TABLE "FeedingMeal" ADD CONSTRAINT "FeedingMeal_feedingId_fkey"
    FOREIGN KEY ("feedingId") REFERENCES "Feeding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FeedingLog" (
  "id" TEXT NOT NULL,
  "mealId" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "scheduledDate" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "loggedAt" TIMESTAMP(3),
  "loggedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedingLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeedingLog_mealId_scheduledDate_key" ON "FeedingLog"("mealId", "scheduledDate");
CREATE INDEX IF NOT EXISTS "FeedingLog_patientId_scheduledDate_idx" ON "FeedingLog"("patientId", "scheduledDate");
DO $$ BEGIN
  ALTER TABLE "FeedingLog" ADD CONSTRAINT "FeedingLog_mealId_fkey"
    FOREIGN KEY ("mealId") REFERENCES "FeedingMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FeedingLog" ADD CONSTRAINT "FeedingLog_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FeedingLog" ADD CONSTRAINT "FeedingLog_loggedByUserId_fkey"
    FOREIGN KEY ("loggedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "UserFavorite" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserFavorite_userId_targetType_targetId_key"
  ON "UserFavorite"("userId", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "UserFavorite_userId_idx" ON "UserFavorite"("userId");
DO $$ BEGIN
  ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "feedingMealId" TEXT;
CREATE INDEX IF NOT EXISTS "Reminder_feedingMealId_idx" ON "Reminder"("feedingMealId");
