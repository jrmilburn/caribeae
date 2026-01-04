-- CreateTable
CREATE TABLE "StudentLevelChange" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromLevelId" TEXT,
    "toLevelId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentLevelChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentLevelChange_studentId_idx" ON "StudentLevelChange"("studentId");
CREATE INDEX "StudentLevelChange_effectiveDate_idx" ON "StudentLevelChange"("effectiveDate");

-- AddForeignKey
ALTER TABLE "StudentLevelChange" ADD CONSTRAINT "StudentLevelChange_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentLevelChange" ADD CONSTRAINT "StudentLevelChange_fromLevelId_fkey" FOREIGN KEY ("fromLevelId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentLevelChange" ADD CONSTRAINT "StudentLevelChange_toLevelId_fkey" FOREIGN KEY ("toLevelId") REFERENCES "Level"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentLevelChange" ADD CONSTRAINT "StudentLevelChange_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
