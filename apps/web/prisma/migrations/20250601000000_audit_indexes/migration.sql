-- Create indexes to speed up audit report queries
CREATE INDEX "Invoice_issuedAt_idx" ON "Invoice"("issuedAt");
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");
