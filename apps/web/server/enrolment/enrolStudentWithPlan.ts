"use server";

import { prisma } from "@/lib/prisma";
import { createEnrolment } from "./createEnrolment";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

type EnrolmentWithPlanInput = {
  studentId: string;
  planId: string;
  startDate: Date;
  endDate?: Date | null;
  templateId?: string;
};

export async function enrolStudentWithPlan(input: EnrolmentWithPlanInput) {
  await getOrCreateUser();
  await requireAdmin();

  const plan = await prisma.enrolmentPlan.findUnique({
    where: { id: input.planId },
    include: { level: true },
  });
  if (!plan) {
    throw new Error("Enrolment plan not found");
  }

  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: { levelId: true },
  });
  if (student?.levelId && student.levelId !== plan.levelId) {
    throw new Error("Student level must match enrolment plan level");
  }
  if (plan.billingType === "PER_WEEK" && !plan.durationWeeks) {
    throw new Error("Weekly plans require a duration");
  }
  if (plan.billingType === "BLOCK" && !plan.blockClassCount) {
    throw new Error("Block plans require a class count");
  }

  if (plan.billingType === "PER_WEEK") {
    const templates = await prisma.classTemplate.findMany({
      where: {
        levelId: plan.levelId,
        active: true,
        startDate: { lte: input.endDate ?? new Date("9999-12-31") },
        OR: [{ endDate: null }, { endDate: { gte: input.startDate } }],
      },
    });

    if (!templates.length) {
      throw new Error("No classes available for this plan level");
    }

    for (const tmpl of templates) {
      await createEnrolment(
        {
          templateId: tmpl.id,
          studentId: input.studentId,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          planId: input.planId,
        },
        { skipAuth: true }
      );
    }
  } else {
    if (!input.templateId) {
      throw new Error("A class template must be selected for this plan");
    }
    await createEnrolment(
      {
        templateId: input.templateId,
        studentId: input.studentId,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        planId: input.planId,
      },
      { skipAuth: true }
    );
  }
}
