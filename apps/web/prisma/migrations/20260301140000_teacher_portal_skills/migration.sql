CREATE TYPE "StudentSkillProgressAction" AS ENUM ('MASTERED', 'UNMASTERED');

CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "levelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentSkillProgress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "masteredAt" TIMESTAMP(3),
    "updatedByTeacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentSkillProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentSkillProgressEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "action" "StudentSkillProgressAction" NOT NULL,
    "note" TEXT,
    "teacherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentSkillProgressEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentSkillProgress_studentId_skillId_key" ON "StudentSkillProgress"("studentId", "skillId");
CREATE INDEX "Skill_levelId_sortOrder_idx" ON "Skill"("levelId", "sortOrder");
CREATE INDEX "Skill_levelId_active_idx" ON "Skill"("levelId", "active");
CREATE INDEX "StudentSkillProgress_studentId_mastered_idx" ON "StudentSkillProgress"("studentId", "mastered");
CREATE INDEX "StudentSkillProgress_skillId_idx" ON "StudentSkillProgress"("skillId");
CREATE INDEX "StudentSkillProgressEvent_studentId_createdAt_idx" ON "StudentSkillProgressEvent"("studentId", "createdAt");
CREATE INDEX "StudentSkillProgressEvent_skillId_createdAt_idx" ON "StudentSkillProgressEvent"("skillId", "createdAt");

ALTER TABLE "Skill" ADD CONSTRAINT "Skill_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "Level"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentSkillProgress" ADD CONSTRAINT "StudentSkillProgress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentSkillProgress" ADD CONSTRAINT "StudentSkillProgress_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentSkillProgress" ADD CONSTRAINT "StudentSkillProgress_updatedByTeacherId_fkey" FOREIGN KEY ("updatedByTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentSkillProgressEvent" ADD CONSTRAINT "StudentSkillProgressEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentSkillProgressEvent" ADD CONSTRAINT "StudentSkillProgressEvent_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentSkillProgressEvent" ADD CONSTRAINT "StudentSkillProgressEvent_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
