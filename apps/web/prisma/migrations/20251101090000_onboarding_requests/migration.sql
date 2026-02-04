-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NEW', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "OnboardingRequest" (
    "id" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "address" TEXT,
    "studentsJson" JSONB NOT NULL,
    "availabilityJson" JSONB NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NEW',
    "familyId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OnboardingRequest" ADD CONSTRAINT "OnboardingRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRequest" ADD CONSTRAINT "OnboardingRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "OnboardingRequest_status_idx" ON "OnboardingRequest"("status");

-- CreateIndex
CREATE INDEX "OnboardingRequest_createdAt_idx" ON "OnboardingRequest"("createdAt");

-- CreateIndex
CREATE INDEX "OnboardingRequest_guardianName_idx" ON "OnboardingRequest"("guardianName");

-- CreateIndex
CREATE INDEX "OnboardingRequest_email_idx" ON "OnboardingRequest"("email");

-- CreateIndex
CREATE INDEX "OnboardingRequest_phone_idx" ON "OnboardingRequest"("phone");
