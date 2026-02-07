ALTER TABLE "OnboardingRequest" ADD COLUMN "secondaryContactName" TEXT;
ALTER TABLE "OnboardingRequest" ADD COLUMN "secondaryEmail" TEXT;
ALTER TABLE "OnboardingRequest" ADD COLUMN "secondaryPhone" TEXT;

CREATE INDEX "OnboardingRequest_secondaryEmail_idx" ON "OnboardingRequest"("secondaryEmail");
CREATE INDEX "OnboardingRequest_secondaryPhone_idx" ON "OnboardingRequest"("secondaryPhone");
