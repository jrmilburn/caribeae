-- CreateEnum
CREATE TYPE "EnrolmentCoverageReason" AS ENUM ('HOLIDAY_ADDED', 'HOLIDAY_REMOVED', 'HOLIDAY_UPDATED', 'CLASS_CHANGED', 'PLAN_CHANGED', 'INVOICE_APPLIED');

-- CreateTable
CREATE TABLE "EnrolmentCoverageAudit" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "reason" "EnrolmentCoverageReason" NOT NULL,
    "previousPaidThroughDate" TIMESTAMP(3),
    "nextPaidThroughDate" TIMESTAMP(3),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrolmentCoverageAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrolmentCoverageAudit_enrolmentId_idx" ON "EnrolmentCoverageAudit"("enrolmentId");

-- CreateIndex
CREATE INDEX "EnrolmentCoverageAudit_reason_idx" ON "EnrolmentCoverageAudit"("reason");

-- CreateIndex
CREATE INDEX "EnrolmentCoverageAudit_createdAt_idx" ON "EnrolmentCoverageAudit"("createdAt");

-- AddForeignKey
ALTER TABLE "EnrolmentCoverageAudit" ADD CONSTRAINT "EnrolmentCoverageAudit_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
