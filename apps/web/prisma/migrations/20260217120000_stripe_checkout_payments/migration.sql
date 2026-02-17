-- CreateEnum
CREATE TYPE "StripePaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "StripePayment" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "StripePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "settledPaymentId" TEXT,
    "metadata" JSONB,
    "settledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripePayment_idempotencyKey_key" ON "StripePayment"("idempotencyKey");
CREATE UNIQUE INDEX "StripePayment_stripeSessionId_key" ON "StripePayment"("stripeSessionId");
CREATE UNIQUE INDEX "StripePayment_stripePaymentIntentId_key" ON "StripePayment"("stripePaymentIntentId");
CREATE INDEX "StripePayment_familyId_createdAt_idx" ON "StripePayment"("familyId", "createdAt");
CREATE INDEX "StripePayment_familyId_status_createdAt_idx" ON "StripePayment"("familyId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "StripePayment" ADD CONSTRAINT "StripePayment_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StripePayment" ADD CONSTRAINT "StripePayment_settledPaymentId_fkey" FOREIGN KEY ("settledPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
