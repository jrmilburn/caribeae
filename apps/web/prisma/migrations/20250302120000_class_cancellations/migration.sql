-- CreateEnum
CREATE TYPE "EnrolmentAdjustmentType" AS ENUM ('CANCELLATION_CREDIT');

-- CreateTable
CREATE TABLE "ClassCancellation" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrolmentAdjustment" (
    "id" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "EnrolmentAdjustmentType" NOT NULL,
    "creditsDelta" INTEGER,
    "paidThroughDeltaDays" INTEGER,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrolmentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClassCancellation_templateId_date_key" ON "ClassCancellation"("templateId", "date");
CREATE INDEX "ClassCancellation_date_idx" ON "ClassCancellation"("date");
CREATE INDEX "ClassCancellation_templateId_date_idx" ON "ClassCancellation"("templateId", "date");

CREATE UNIQUE INDEX "EnrolmentAdjustment_enrolmentId_templateId_date_type_key" ON "EnrolmentAdjustment"("enrolmentId", "templateId", "date", "type");
CREATE INDEX "EnrolmentAdjustment_templateId_date_idx" ON "EnrolmentAdjustment"("templateId", "date");

-- AddForeignKey
ALTER TABLE "ClassCancellation" ADD CONSTRAINT "ClassCancellation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassCancellation" ADD CONSTRAINT "ClassCancellation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EnrolmentAdjustment" ADD CONSTRAINT "EnrolmentAdjustment_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrolmentAdjustment" ADD CONSTRAINT "EnrolmentAdjustment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrolmentAdjustment" ADD CONSTRAINT "EnrolmentAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
