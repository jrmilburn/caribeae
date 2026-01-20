-- Add invoice kind for catch-up invoices
CREATE TYPE "InvoiceKind" AS ENUM ('STANDARD', 'CATCH_UP');

ALTER TABLE "Invoice"
  ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "InvoiceLineItem"
  ADD COLUMN "blocksBilled" INTEGER,
  ADD COLUMN "billingType" "BillingType",
  ADD COLUMN "planId" TEXT;

ALTER TABLE "InvoiceLineItem"
  ADD CONSTRAINT "InvoiceLineItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EnrolmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InvoiceLineItem_planId_idx" ON "InvoiceLineItem"("planId");
