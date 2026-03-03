ALTER TABLE "AwayPeriodImpact"
  ADD COLUMN "consumedOccurrences" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AwayPeriodImpact"
  ALTER COLUMN "paidThroughDeltaDays" SET DEFAULT 0;

-- Legacy away impacts already advanced paid-through immediately.
-- Mark them consumed to avoid double-application under the new deferred-credit logic.
UPDATE "AwayPeriodImpact"
SET "consumedOccurrences" = "missedOccurrences"
WHERE "paidThroughDeltaDays" > 0;
