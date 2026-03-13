ALTER TABLE "Enrolment"
ADD COLUMN "transferFromEnrolmentId" TEXT,
ADD COLUMN "transferEffectiveAt" TIMESTAMP(3),
ADD COLUMN "transferMetadata" JSONB;

CREATE INDEX "Enrolment_transferFromEnrolmentId_idx" ON "Enrolment"("transferFromEnrolmentId");
CREATE INDEX "Enrolment_transferEffectiveAt_idx" ON "Enrolment"("transferEffectiveAt");

ALTER TABLE "Enrolment"
ADD CONSTRAINT "Enrolment_transferFromEnrolmentId_fkey"
FOREIGN KEY ("transferFromEnrolmentId") REFERENCES "Enrolment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EnrolmentTransfer" (
  "id" TEXT NOT NULL,
  "oldEnrolmentId" TEXT NOT NULL,
  "newEnrolmentId" TEXT NOT NULL,
  "familyId" TEXT,
  "transferEffectiveAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "applyOverpaidCredit" BOOLEAN NOT NULL DEFAULT true,
  "takePaymentNow" BOOLEAN NOT NULL DEFAULT false,
  "oldOutstandingCents" INTEGER NOT NULL DEFAULT 0,
  "oldOverpaidCreditCents" INTEGER NOT NULL DEFAULT 0,
  "releasedPaymentCreditCents" INTEGER NOT NULL DEFAULT 0,
  "newBlockChargeCents" INTEGER NOT NULL DEFAULT 0,
  "creditAppliedCents" INTEGER NOT NULL DEFAULT 0,
  "paymentAmountCents" INTEGER NOT NULL DEFAULT 0,
  "oldInvoiceId" TEXT,
  "newInvoiceId" TEXT,
  "creditPaymentId" TEXT,
  "paymentId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrolmentTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrolmentTransfer_oldEnrolmentId_key" ON "EnrolmentTransfer"("oldEnrolmentId");
CREATE UNIQUE INDEX "EnrolmentTransfer_newEnrolmentId_key" ON "EnrolmentTransfer"("newEnrolmentId");
CREATE UNIQUE INDEX "EnrolmentTransfer_idempotencyKey_key" ON "EnrolmentTransfer"("idempotencyKey");
CREATE INDEX "EnrolmentTransfer_familyId_createdAt_idx" ON "EnrolmentTransfer"("familyId", "createdAt");
CREATE INDEX "EnrolmentTransfer_transferEffectiveAt_idx" ON "EnrolmentTransfer"("transferEffectiveAt");

ALTER TABLE "EnrolmentTransfer"
ADD CONSTRAINT "EnrolmentTransfer_oldEnrolmentId_fkey"
FOREIGN KEY ("oldEnrolmentId") REFERENCES "Enrolment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnrolmentTransfer"
ADD CONSTRAINT "EnrolmentTransfer_newEnrolmentId_fkey"
FOREIGN KEY ("newEnrolmentId") REFERENCES "Enrolment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
