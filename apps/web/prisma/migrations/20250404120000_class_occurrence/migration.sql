-- Attendance + teacher substitutions for class occurrences

-- Create enum for attendance status if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceStatus') THEN
    CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');
  END IF;
END$$;

-- Teacher substitutions are keyed by template + occurrence date
CREATE TABLE IF NOT EXISTS "TeacherSubstitution" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "teacherId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherSubstitution_pkey" PRIMARY KEY ("id")
);

-- Attendance is stored per template, occurrence date, and student
CREATE TABLE IF NOT EXISTS "Attendance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- Indexes + uniques
CREATE UNIQUE INDEX IF NOT EXISTS "TeacherSubstitution_templateId_date_key"
  ON "TeacherSubstitution"("templateId", "date");
CREATE INDEX IF NOT EXISTS "TeacherSubstitution_date_idx" ON "TeacherSubstitution"("date");
CREATE INDEX IF NOT EXISTS "TeacherSubstitution_templateId_date_idx"
  ON "TeacherSubstitution"("templateId", "date");

CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_templateId_date_studentId_key"
  ON "Attendance"("templateId", "date", "studentId");
CREATE INDEX IF NOT EXISTS "Attendance_date_idx" ON "Attendance"("date");
CREATE INDEX IF NOT EXISTS "Attendance_studentId_date_idx" ON "Attendance"("studentId", "date");
CREATE INDEX IF NOT EXISTS "Attendance_templateId_date_idx" ON "Attendance"("templateId", "date");

-- Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherSubstitution_templateId_fkey') THEN
    ALTER TABLE "TeacherSubstitution"
      ADD CONSTRAINT "TeacherSubstitution_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TeacherSubstitution_teacherId_fkey') THEN
    ALTER TABLE "TeacherSubstitution"
      ADD CONSTRAINT "TeacherSubstitution_teacherId_fkey"
      FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attendance_templateId_fkey') THEN
    ALTER TABLE "Attendance"
      ADD CONSTRAINT "Attendance_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "ClassTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attendance_studentId_fkey') THEN
    ALTER TABLE "Attendance"
      ADD CONSTRAINT "Attendance_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
