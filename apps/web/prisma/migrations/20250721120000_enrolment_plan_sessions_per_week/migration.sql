-- Add optional weekly session count to support multi-session plans.
ALTER TABLE "EnrolmentPlan" ADD COLUMN "sessionsPerWeek" INTEGER;
