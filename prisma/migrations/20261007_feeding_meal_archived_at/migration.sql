-- Optional column. Meals with logs are archived instead of deleted.
ALTER TABLE "FeedingMeal" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
