-- CreateEnum
CREATE TYPE "AttendanceExcusedReason" AS ENUM ('AWAY_PERIOD', 'SICK', 'OTHER');

-- CreateEnum
CREATE TYPE "MakeupCreditReason" AS ENUM ('SICK', 'OTHER');

-- CreateEnum
CREATE TYPE "MakeupCreditStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'USED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MakeupBookingStatus" AS ENUM ('BOOKED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Attendance"
  ADD COLUMN "excusedReason" "AttendanceExcusedReason",
  ADD COLUMN "sourceAwayPeriodId" TEXT;

-- DropTable
DROP TABLE "Makeup";

-- CreateTable
CREATE TABLE "MakeupCredit" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "earnedFromClassId" TEXT,
    "earnedFromSessionDate" TIMESTAMP(3),
    "reason" "MakeupCreditReason" NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "MakeupCreditStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "levelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MakeupCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MakeupBooking" (
    "id" TEXT NOT NULL,
    "makeupCreditId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "targetClassId" TEXT NOT NULL,
    "targetSessionDate" TIMESTAMP(3) NOT NULL,
    "status" "MakeupBookingStatus" NOT NULL DEFAULT 'BOOKED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MakeupBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_templateId_date_status_idx" ON "Attendance"("templateId", "date", "status");
CREATE INDEX "Attendance_templateId_date_excusedReason_idx" ON "Attendance"("templateId", "date", "excusedReason");
CREATE INDEX "MakeupCredit_studentId_status_idx" ON "MakeupCredit"("studentId", "status");
CREATE INDEX "MakeupCredit_familyId_status_idx" ON "MakeupCredit"("familyId", "status");
CREATE INDEX "MakeupCredit_expiresAt_idx" ON "MakeupCredit"("expiresAt");
CREATE UNIQUE INDEX "MakeupBooking_makeupCreditId_key" ON "MakeupBooking"("makeupCreditId");
CREATE UNIQUE INDEX "MakeupBooking_targetClassId_targetSessionDate_studentId_key" ON "MakeupBooking"("targetClassId", "targetSessionDate", "studentId");
CREATE INDEX "MakeupBooking_targetClassId_targetSessionDate_status_idx" ON "MakeupBooking"("targetClassId", "targetSessionDate", "status");
CREATE INDEX "MakeupBooking_studentId_status_idx" ON "MakeupBooking"("studentId", "status");
CREATE INDEX "MakeupBooking_familyId_status_idx" ON "MakeupBooking"("familyId", "status");

-- AddForeignKey
ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_sourceAwayPeriodId_fkey"
  FOREIGN KEY ("sourceAwayPeriodId") REFERENCES "AwayPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MakeupCredit"
  ADD CONSTRAINT "MakeupCredit_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeupCredit"
  ADD CONSTRAINT "MakeupCredit_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeupCredit"
  ADD CONSTRAINT "MakeupCredit_earnedFromClassId_fkey"
  FOREIGN KEY ("earnedFromClassId") REFERENCES "ClassTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MakeupCredit"
  ADD CONSTRAINT "MakeupCredit_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MakeupCredit"
  ADD CONSTRAINT "MakeupCredit_levelId_fkey"
  FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MakeupBooking"
  ADD CONSTRAINT "MakeupBooking_makeupCreditId_fkey"
  FOREIGN KEY ("makeupCreditId") REFERENCES "MakeupCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeupBooking"
  ADD CONSTRAINT "MakeupBooking_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeupBooking"
  ADD CONSTRAINT "MakeupBooking_familyId_fkey"
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MakeupBooking"
  ADD CONSTRAINT "MakeupBooking_targetClassId_fkey"
  FOREIGN KEY ("targetClassId") REFERENCES "ClassTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
