-- Add enums for Standard Connect account tracking.
CREATE TYPE "StripeAccountType" AS ENUM ('standard');
CREATE TYPE "StripeOnboardingStatus" AS ENUM ('not_connected', 'pending', 'connected');

ALTER TABLE "ConnectedAccount"
  ADD COLUMN "stripeAccountType" "StripeAccountType",
  ADD COLUMN "stripeLastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "stripeOnboardingStatusNew" "StripeOnboardingStatus" NOT NULL DEFAULT 'not_connected';

-- Existing rows come from the previous Express-only implementation. Keep account type
-- unset until an admin reconnects with the new Standard flow.
UPDATE "ConnectedAccount"
SET "stripeAccountType" = NULL;

UPDATE "ConnectedAccount"
SET
  "stripeOnboardingStatusNew" = CASE
    WHEN "stripeAccountId" IS NULL THEN 'not_connected'::"StripeOnboardingStatus"
    WHEN "stripeOnboardingStatus" = 'complete' THEN 'connected'::"StripeOnboardingStatus"
    WHEN COALESCE("stripeChargesEnabled", false)
      AND COALESCE("stripePayoutsEnabled", false)
      AND COALESCE("stripeDetailsSubmitted", false)
      THEN 'connected'::"StripeOnboardingStatus"
    ELSE 'pending'::"StripeOnboardingStatus"
  END,
  "stripeLastSyncedAt" = CASE
    WHEN "stripeAccountId" IS NULL THEN NULL
    ELSE CURRENT_TIMESTAMP
  END;

ALTER TABLE "ConnectedAccount" DROP COLUMN "stripeOnboardingStatus";
ALTER TABLE "ConnectedAccount" RENAME COLUMN "stripeOnboardingStatusNew" TO "stripeOnboardingStatus";
