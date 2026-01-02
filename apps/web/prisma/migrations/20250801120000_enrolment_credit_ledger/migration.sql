-- CreateEnum
CREATE TYPE "EnrolmentCreditEventType" AS ENUM ('PURCHASE', 'CONSUME', 'CANCELLATION_CREDIT', 'MANUAL_ADJUST');

-- AlterTable
ALTER TABLE "Enrolment" ADD COLUMN     "paidThroughDateComputed" TIMESTAMP(3),
ADD COLUMN     "nextDueDateComputed" TIMESTAMP(3),
ADD COLUMN     "creditsBalanceCached" INTEGER;

-- CreateTable
CREATE TABLE "EnrolmentCreditEvent" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "type" "EnrolmentCreditEventType" NOT NULL,
    "creditsDelta" INTEGER NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "invoiceId" TEXT,
    "attendanceId" TEXT,
    "adjustmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrolmentCreditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrolmentCreditEvent_enrolmentId_occurredOn_idx" ON "EnrolmentCreditEvent"("enrolmentId", "occurredOn");

-- CreateIndex
CREATE INDEX "EnrolmentCreditEvent_occurredOn_idx" ON "EnrolmentCreditEvent"("occurredOn");

-- CreateIndex
CREATE INDEX "EnrolmentCreditEvent_invoiceId_idx" ON "EnrolmentCreditEvent"("invoiceId");

-- CreateIndex
CREATE INDEX "EnrolmentCreditEvent_attendanceId_idx" ON "EnrolmentCreditEvent"("attendanceId");

-- CreateIndex
CREATE INDEX "EnrolmentCreditEvent_adjustmentId_idx" ON "EnrolmentCreditEvent"("adjustmentId");

-- AddForeignKey
ALTER TABLE "EnrolmentCreditEvent" ADD CONSTRAINT "EnrolmentCreditEvent_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrolmentCreditEvent" ADD CONSTRAINT "EnrolmentCreditEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrolmentCreditEvent" ADD CONSTRAINT "EnrolmentCreditEvent_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrolmentCreditEvent" ADD CONSTRAINT "EnrolmentCreditEvent_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "EnrolmentAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill legacy balances into the ledger cache
UPDATE "Enrolment" SET "creditsBalanceCached" = "creditsRemaining" WHERE "creditsRemaining" IS NOT NULL;

INSERT INTO "EnrolmentCreditEvent" ("id", "enrolmentId", "type", "creditsDelta", "occurredOn")
SELECT md5(random()::text || clock_timestamp()::text), "id", 'MANUAL_ADJUST', COALESCE("creditsRemaining", 0), COALESCE("paidThroughDate", "startDate", now())
FROM "Enrolment"
WHERE "creditsRemaining" IS NOT NULL AND "creditsRemaining" <> 0;

UPDATE "Enrolment" SET "paidThroughDateComputed" = "paidThroughDate" WHERE "paidThroughDate" IS NOT NULL;
