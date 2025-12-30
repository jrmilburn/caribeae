-- Add idempotency key to payments to avoid double-recording
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;

-- Ensure a key cannot be reused for the same family
CREATE UNIQUE INDEX "Payment_familyId_idempotencyKey_key" ON "Payment"("familyId", "idempotencyKey");
