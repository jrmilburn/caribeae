-- Migrate legacy BLOCK billing plans to PER_CLASS and remove the BLOCK enum value.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "EnrolmentPlan"
    WHERE "billingType" = 'BLOCK'
      AND ("blockClassCount" IS NULL OR "blockClassCount" <= 0)
  ) THEN
    RAISE EXCEPTION 'Cannot migrate BLOCK billing plans: blockClassCount must be set and > 0 for %',
      (SELECT string_agg(id, ',') FROM "EnrolmentPlan" WHERE "billingType" = 'BLOCK' AND ("blockClassCount" IS NULL OR "blockClassCount" <= 0));
  END IF;

  UPDATE "EnrolmentPlan"
  SET "billingType" = 'PER_CLASS'
  WHERE "billingType" = 'BLOCK';
END $$;

-- Recreate enum without BLOCK
CREATE TYPE "BillingType_new" AS ENUM ('PER_WEEK', 'PER_CLASS');

ALTER TABLE "EnrolmentPlan"
  ALTER COLUMN "billingType" DROP DEFAULT,
  ALTER COLUMN "billingType" TYPE "BillingType_new" USING ("billingType"::text::"BillingType_new"),
  ALTER COLUMN "billingType" SET DEFAULT 'PER_CLASS';

DROP TYPE "BillingType";
ALTER TYPE "BillingType_new" RENAME TO "BillingType";
