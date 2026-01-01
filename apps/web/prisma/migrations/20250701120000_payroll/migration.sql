-- CreateEnum
CREATE TYPE "PayRunStatus" AS ENUM ('DRAFT', 'LOCKED', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "TeacherTimesheetEntry" ADD COLUMN     "payRunId" TEXT;

-- CreateTable
CREATE TABLE "TeacherPayRate" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherPayRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRun" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayRunStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRunLine" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "minutesTotal" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "hourlyRateCentsSnapshot" INTEGER,
    "rateBreakdownJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "minutesDelta" INTEGER NOT NULL,
    "centsDelta" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdById" TEXT,
    "appliedPayRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherPayRate_teacherId_effectiveFrom_idx" ON "TeacherPayRate"("teacherId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherPayRate_teacherId_effectiveFrom_key" ON "TeacherPayRate"("teacherId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayRun_periodStart_periodEnd_idx" ON "PayRun"("periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PayRunLine_payRunId_teacherId_key" ON "PayRunLine"("payRunId", "teacherId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_teacherId_date_idx" ON "PayrollAdjustment"("teacherId", "date");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_appliedPayRunId_idx" ON "PayrollAdjustment"("appliedPayRunId");

-- CreateIndex
CREATE INDEX "TeacherTimesheetEntry_payRunId_idx" ON "TeacherTimesheetEntry"("payRunId");

-- AddForeignKey
ALTER TABLE "TeacherTimesheetEntry" ADD CONSTRAINT "TeacherTimesheetEntry_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPayRate" ADD CONSTRAINT "TeacherPayRate_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherPayRate" ADD CONSTRAINT "TeacherPayRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRun" ADD CONSTRAINT "PayRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "PayRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRunLine" ADD CONSTRAINT "PayRunLine_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_appliedPayRunId_fkey" FOREIGN KEY ("appliedPayRunId") REFERENCES "PayRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

