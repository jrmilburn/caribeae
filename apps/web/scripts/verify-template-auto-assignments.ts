/**
 * Verify auto-assignment of weekly enrolments to newly created templates.
 * Run with: pnpm tsx scripts/verify-template-auto-assignments.ts
 */
import assert from "node:assert/strict";

import { addDays } from "date-fns";
import { BillingType, EnrolmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { autoAssignWeeklyEnrolmentsToTemplate } from "@/server/classTemplate/autoAssignWeeklyEnrolments";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

async function main() {
  const today = brisbaneStartOfDay(new Date());
  const yesterday = addDays(today, -1);

  const createdIds: {
    levelIds: string[];
    planIds: string[];
    studentIds: string[];
    familyIds: string[];
    templateIds: string[];
    enrolmentIds: string[];
  } = {
    levelIds: [],
    planIds: [],
    studentIds: [],
    familyIds: [],
    templateIds: [],
    enrolmentIds: [],
  };

  try {
    const levelA = await prisma.level.create({ data: { name: "AutoAssign Level A" } });
    const levelB = await prisma.level.create({ data: { name: "AutoAssign Level B" } });
    createdIds.levelIds.push(levelA.id, levelB.id);

    const planA = await prisma.enrolmentPlan.create({
      data: {
        name: "Weekly A",
        priceCents: 1000,
        billingType: BillingType.PER_WEEK,
        enrolmentType: "BLOCK",
        durationWeeks: 4,
        levelId: levelA.id,
      },
    });
    const planB = await prisma.enrolmentPlan.create({
      data: {
        name: "Weekly B",
        priceCents: 1000,
        billingType: BillingType.PER_WEEK,
        enrolmentType: "BLOCK",
        durationWeeks: 4,
        levelId: levelB.id,
      },
    });
    createdIds.planIds.push(planA.id, planB.id);

    const studentA = await prisma.student.create({
      data: {
        name: "Weekly Student A",
        family: { create: { name: "Weekly Family A" } },
        levelId: levelA.id,
      },
    });
    const studentInactive = await prisma.student.create({
      data: {
        name: "Weekly Student Inactive",
        family: { create: { name: "Weekly Family Inactive" } },
        levelId: levelA.id,
      },
    });
    const studentB = await prisma.student.create({
      data: {
        name: "Weekly Student B",
        family: { create: { name: "Weekly Family B" } },
        levelId: levelB.id,
      },
    });
    createdIds.studentIds.push(studentA.id, studentInactive.id, studentB.id);
    createdIds.familyIds.push(studentA.familyId, studentInactive.familyId, studentB.familyId);

    const templateA = await prisma.classTemplate.create({
      data: {
        name: "Anchor A",
        levelId: levelA.id,
        startDate: today,
        active: true,
      },
    });
    const templateB = await prisma.classTemplate.create({
      data: {
        name: "Anchor B",
        levelId: levelB.id,
        startDate: today,
        active: true,
      },
    });
    createdIds.templateIds.push(templateA.id, templateB.id);

    const enrolmentActive = await prisma.enrolment.create({
      data: {
        studentId: studentA.id,
        templateId: templateA.id,
        planId: planA.id,
        startDate: today,
        status: EnrolmentStatus.ACTIVE,
        paidThroughDate: addDays(today, 7),
      },
    });
    const enrolmentInactive = await prisma.enrolment.create({
      data: {
        studentId: studentInactive.id,
        templateId: templateA.id,
        planId: planA.id,
        startDate: today,
        endDate: yesterday,
        status: EnrolmentStatus.ACTIVE,
        paidThroughDate: addDays(today, 7),
      },
    });
    const enrolmentOtherLevel = await prisma.enrolment.create({
      data: {
        studentId: studentB.id,
        templateId: templateB.id,
        planId: planB.id,
        startDate: today,
        status: EnrolmentStatus.ACTIVE,
        paidThroughDate: addDays(today, 7),
      },
    });
    createdIds.enrolmentIds.push(enrolmentActive.id, enrolmentInactive.id, enrolmentOtherLevel.id);

    const newTemplate = await prisma.$transaction(async (tx) => {
      const created = await tx.classTemplate.create({
        data: {
          name: "New Weekly Template",
          levelId: levelA.id,
          startDate: today,
          active: true,
        },
      });
      await autoAssignWeeklyEnrolmentsToTemplate({
        tx,
        templateId: created.id,
        levelId: created.levelId,
        asOfDate: today,
      });
      return created;
    });
    createdIds.templateIds.push(newTemplate.id);

    const assignments = await prisma.enrolmentClassAssignment.findMany({
      where: { templateId: newTemplate.id },
      select: { enrolmentId: true },
    });

    const assignedIds = assignments.map((assignment) => assignment.enrolmentId).sort();
    assert.deepStrictEqual(assignedIds, [enrolmentActive.id].sort());

    await prisma.$transaction(async (tx) => {
      await autoAssignWeeklyEnrolmentsToTemplate({
        tx,
        templateId: newTemplate.id,
        levelId: newTemplate.levelId,
        asOfDate: today,
      });
    });

    const assignmentsAfter = await prisma.enrolmentClassAssignment.count({
      where: { templateId: newTemplate.id },
    });
    assert.strictEqual(assignmentsAfter, assignments.length);

    console.log("Auto-assignment verification passed.");
  } finally {
    await prisma.enrolmentClassAssignment.deleteMany({
      where: { templateId: { in: createdIds.templateIds } },
    });
    await prisma.enrolment.deleteMany({ where: { id: { in: createdIds.enrolmentIds } } });
    await prisma.classTemplate.deleteMany({ where: { id: { in: createdIds.templateIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdIds.studentIds } } });
    await prisma.family.deleteMany({ where: { id: { in: createdIds.familyIds } } });
    await prisma.enrolmentPlan.deleteMany({ where: { id: { in: createdIds.planIds } } });
    await prisma.level.deleteMany({ where: { id: { in: createdIds.levelIds } } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
