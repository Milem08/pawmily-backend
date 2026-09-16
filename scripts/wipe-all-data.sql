-- PawMily DATA wipe (schema preserved). DO NOT RUN until user confirms.
-- Suggested: take a backup first (Supabase dashboard → Database → Backups / pg_dump).
-- Order respects foreign keys.

BEGIN;

DELETE FROM "FeedingLog";
DELETE FROM "FeedingMeal";
DELETE FROM "Reminder";
UPDATE "MedicalRecord" SET "followUpAppointmentId" = NULL WHERE "followUpAppointmentId" IS NOT NULL;
DELETE FROM "Appointment";
DELETE FROM "MedicalRecord";
DELETE FROM "Feeding";
DELETE FROM "LinkRequest";
DELETE FROM "PatientAccess";
DELETE FROM "UserFavorite";
DELETE FROM "AuditLog";
DELETE FROM "MediaAsset";
DELETE FROM "Patient";
DELETE FROM "RefreshToken";
DELETE FROM "PasswordResetToken";
DELETE FROM "EmailVerificationToken";
DELETE FROM "ClinicConfig";
DELETE FROM "User";

COMMIT;

-- Verify tables still exist (expect counts = 0 for data tables):
-- SELECT 'User' t, count(*) n FROM "User" UNION ALL SELECT 'Patient', count(*) FROM "Patient";
