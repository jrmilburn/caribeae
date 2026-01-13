-- Add scoped holiday fields
ALTER TABLE "Holiday" ADD COLUMN "levelId" TEXT;
ALTER TABLE "Holiday" ADD COLUMN "templateId" TEXT;

CREATE INDEX "Holiday_levelId_idx" ON "Holiday"("levelId");
CREATE INDEX "Holiday_templateId_idx" ON "Holiday"("templateId");

ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "EnrolmentCoverageReason" ADD VALUE IF NOT EXISTS 'CANCELLATION_CREATED';
ALTER TYPE "EnrolmentCoverageReason" ADD VALUE IF NOT EXISTS 'CANCELLATION_REVERSED';
