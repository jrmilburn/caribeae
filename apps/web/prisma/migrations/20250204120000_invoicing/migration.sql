-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'VOID', 'OVERDUE');

-- AlterEnum
ALTER TYPE "BillingType" ADD VALUE IF NOT EXISTS 'BLOCK';

-- AlterTable
ALTER TABLE "EnrolmentPlan" ADD COLUMN     "durationWeeks" INTEGER,
ADD COLUMN     "blockClassCount" INTEGER;

ALTER TABLE "Enrolment" ADD COLUMN     "paidThroughDate" TIMESTAMP(3),
ADD COLUMN     "creditsRemaining" INTEGER;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "enrolmentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "coverageStart" TIMESTAMP(3),
    "coverageEnd" TIMESTAMP(3),
    "creditsPurchased" INTEGER,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicingSweepState" (
    "id" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoicingSweepState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_familyId_status_idx" ON "Invoice"("familyId", "status");
CREATE INDEX "Invoice_enrolmentId_status_idx" ON "Invoice"("enrolmentId", "status");
CREATE INDEX "Invoice_dueAt_idx" ON "Invoice"("dueAt");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
