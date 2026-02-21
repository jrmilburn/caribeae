-- CreateTable
CREATE TABLE "AwayPeriod" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "studentId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwayPeriodImpact" (
    "id" TEXT NOT NULL,
    "awayPeriodId" TEXT NOT NULL,
    "enrolmentId" TEXT NOT NULL,
    "missedOccurrences" INTEGER NOT NULL,
    "paidThroughDeltaDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwayPeriodImpact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AwayPeriod_familyId_startDate_idx" ON "AwayPeriod"("familyId", "startDate");
CREATE INDEX "AwayPeriod_familyId_endDate_idx" ON "AwayPeriod"("familyId", "endDate");
CREATE INDEX "AwayPeriod_studentId_startDate_idx" ON "AwayPeriod"("studentId", "startDate");
CREATE INDEX "AwayPeriod_deletedAt_idx" ON "AwayPeriod"("deletedAt");
CREATE UNIQUE INDEX "AwayPeriodImpact_awayPeriodId_enrolmentId_key" ON "AwayPeriodImpact"("awayPeriodId", "enrolmentId");
CREATE INDEX "AwayPeriodImpact_enrolmentId_idx" ON "AwayPeriodImpact"("enrolmentId");

-- AddForeignKey
ALTER TABLE "AwayPeriod" ADD CONSTRAINT "AwayPeriod_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AwayPeriod" ADD CONSTRAINT "AwayPeriod_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AwayPeriod" ADD CONSTRAINT "AwayPeriod_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AwayPeriodImpact" ADD CONSTRAINT "AwayPeriodImpact_awayPeriodId_fkey" FOREIGN KEY ("awayPeriodId") REFERENCES "AwayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AwayPeriodImpact" ADD CONSTRAINT "AwayPeriodImpact_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "Enrolment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
