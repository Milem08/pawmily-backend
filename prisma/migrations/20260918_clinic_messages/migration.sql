-- In-app clinical inbox (correo clínico)
CREATE TABLE IF NOT EXISTS "ClinicMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClinicMessage_userId_createdAt_idx" ON "ClinicMessage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClinicMessage_userId_readAt_idx" ON "ClinicMessage"("userId", "readAt");
CREATE INDEX IF NOT EXISTS "ClinicMessage_patientId_idx" ON "ClinicMessage"("patientId");
CREATE INDEX IF NOT EXISTS "ClinicMessage_type_idx" ON "ClinicMessage"("type");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClinicMessage_userId_fkey'
  ) THEN
    ALTER TABLE "ClinicMessage"
      ADD CONSTRAINT "ClinicMessage_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClinicMessage_patientId_fkey'
  ) THEN
    ALTER TABLE "ClinicMessage"
      ADD CONSTRAINT "ClinicMessage_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
