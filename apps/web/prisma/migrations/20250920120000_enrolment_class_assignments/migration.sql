ALTER TABLE "Enrolment" ADD COLUMN "billingGroupId" TEXT;
ALTER TABLE "Enrolment" ADD COLUMN "isBillingPrimary" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Enrolment" ADD COLUMN "billingPrimaryId" TEXT;

CREATE INDEX "Enrolment_billingGroupId_idx" ON "Enrolment"("billingGroupId");

CREATE TABLE "EnrolmentClassAssignment" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrolmentClassAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrolmentClassAssignment_enrolmentId_templateId_key" ON "EnrolmentClassAssignment"("enrolmentId", "templateId");
CREATE INDEX "EnrolmentClassAssignment_templateId_idx" ON "EnrolmentClassAssignment"("templateId");

ALTER TABLE "EnrolmentClassAssignment" ADD CONSTRAINT "EnrolmentClassAssignment_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrolmentClassAssignment" ADD CONSTRAINT "EnrolmentClassAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Enrolment"
SET "billingGroupId" = "id",
    "isBillingPrimary" = true
WHERE "billingGroupId" IS NULL;

INSERT INTO "EnrolmentClassAssignment" ("id", "enrolmentId", "templateId")
SELECT md5(random()::text || clock_timestamp()::text), "id", "templateId"
FROM "Enrolment"
WHERE "templateId" IS NOT NULL
ON CONFLICT ("enrolmentId", "templateId") DO NOTHING;
