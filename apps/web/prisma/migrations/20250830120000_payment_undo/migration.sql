-- Track payment lifecycle for undo/void semantics.

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'VOID');

-- AlterTable
ALTER TABLE "Payment"
  ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN     "reversedAt" TIMESTAMP(3),
  ADD COLUMN     "reversalReason" TEXT;

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
