ALTER TABLE "EnrolmentPlan"
  ADD COLUMN "earlyPaymentDiscountBps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Payment"
  ADD COLUMN "grossAmountCents" INTEGER,
  ADD COLUMN "earlyPaymentDiscountApplied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "earlyPaymentDiscountAmountCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "Payment"
SET "grossAmountCents" = "amountCents"
WHERE "grossAmountCents" IS NULL;

ALTER TABLE "Payment"
  ALTER COLUMN "grossAmountCents" SET NOT NULL;

ALTER TABLE "Payment"
  ALTER COLUMN "grossAmountCents" SET DEFAULT 0;

ALTER TABLE "InvoiceLineItem"
  ADD COLUMN "appliedByPaymentId" TEXT;

CREATE INDEX "InvoiceLineItem_appliedByPaymentId_idx" ON "InvoiceLineItem"("appliedByPaymentId");

ALTER TABLE "InvoiceLineItem"
  ADD CONSTRAINT "InvoiceLineItem_appliedByPaymentId_fkey"
    FOREIGN KEY ("appliedByPaymentId") REFERENCES "Payment"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE "EnrolmentPlan"
  ADD CONSTRAINT "EnrolmentPlan_earlyPaymentDiscountBps_check"
    CHECK ("earlyPaymentDiscountBps" >= 0 AND "earlyPaymentDiscountBps" <= 10000);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_grossAmountCents_check"
    CHECK ("grossAmountCents" >= "amountCents");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_earlyPaymentDiscountAmountCents_check"
    CHECK ("earlyPaymentDiscountAmountCents" >= 0);
