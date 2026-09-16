const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const stmts = [
  'ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "foodType" TEXT',
  'ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "brand" TEXT',
  'ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "quantity" TEXT',
  'ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "frequency" TEXT',
  'ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "restrictions" TEXT',
  'ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "allergies" TEXT',
  'ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "observations" TEXT',
  'ALTER TABLE "Feeding" ADD COLUMN IF NOT EXISTS "vetRecommendations" TEXT',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "description" TEXT',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "category" TEXT',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT \'media\'',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "color" TEXT',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "icon" TEXT',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "notifyEnabled" BOOLEAN NOT NULL DEFAULT true',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "notes" TEXT',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "recurrence" TEXT DEFAULT \'none\'',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "completed" BOOLEAN NOT NULL DEFAULT false',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3)',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT',
  'ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "notificationMessage" TEXT',
  'CREATE INDEX IF NOT EXISTS "Reminder_createdByUserId_idx" ON "Reminder"("createdByUserId")',
  'ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "ownerConfirmedAt" TIMESTAMP(3)',
  'ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "attendanceStatus" TEXT DEFAULT \'Pendiente\'',
];

(async () => {
  for (const s of stmts) {
    try {
      await prisma.$executeRawUnsafe(s);
      console.log('OK', s.slice(0, 70));
    } catch (e) {
      console.log('ERR', s.slice(0, 70), e.message);
    }
  }
  await prisma.$disconnect();
})();
