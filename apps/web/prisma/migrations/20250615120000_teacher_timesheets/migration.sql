-- Timesheet tracking for teacher payroll
CREATE TYPE "TimesheetStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "TimesheetSource" AS ENUM ('DERIVED', 'ATTENDANCE', 'MANUAL');

CREATE TABLE "TeacherTimesheetEntry" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT,
    "minutesBase" INTEGER NOT NULL,
    "minutesAdjustment" INTEGER NOT NULL DEFAULT 0,
    "minutesFinal" INTEGER NOT NULL,
    "status" "TimesheetStatus" NOT NULL,
    "source" "TimesheetSource" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherTimesheetEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeacherTimesheetAdjustment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "minutesDelta" INTEGER NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherTimesheetAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeacherTimesheetEntry_templateId_date_key" ON "TeacherTimesheetEntry"("templateId", "date");
CREATE INDEX "TeacherTimesheetEntry_teacherId_date_idx" ON "TeacherTimesheetEntry"("teacherId", "date");
CREATE INDEX "TeacherTimesheetEntry_date_idx" ON "TeacherTimesheetEntry"("date");
CREATE INDEX "TeacherTimesheetEntry_templateId_date_idx" ON "TeacherTimesheetEntry"("templateId", "date");

ALTER TABLE "TeacherTimesheetEntry" ADD CONSTRAINT "TeacherTimesheetEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherTimesheetEntry" ADD CONSTRAINT "TeacherTimesheetEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeacherTimesheetEntry" ADD CONSTRAINT "TeacherTimesheetEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeacherTimesheetAdjustment" ADD CONSTRAINT "TeacherTimesheetAdjustment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TeacherTimesheetEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherTimesheetAdjustment" ADD CONSTRAINT "TeacherTimesheetAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
