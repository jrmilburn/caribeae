-- CreateEnum
CREATE TYPE "WaitlistRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "WaitlistRequest" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestedClassId" TEXT NOT NULL,
    "requestedLevelId" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "WaitlistRequestStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistRequest_status_createdAt_idx" ON "WaitlistRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WaitlistRequest_familyId_idx" ON "WaitlistRequest"("familyId");

-- AddForeignKey
ALTER TABLE "WaitlistRequest" ADD CONSTRAINT "WaitlistRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistRequest" ADD CONSTRAINT "WaitlistRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistRequest" ADD CONSTRAINT "WaitlistRequest_requestedClassId_fkey" FOREIGN KEY ("requestedClassId") REFERENCES "ClassTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistRequest" ADD CONSTRAINT "WaitlistRequest_requestedLevelId_fkey" FOREIGN KEY ("requestedLevelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistRequest" ADD CONSTRAINT "WaitlistRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
