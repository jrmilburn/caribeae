// /server/enrolment/createEnrolment.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { EnrolmentStatus, BillingType, EnrolmentType } from "@prisma/client";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

type CreateEnrolmentInput = {
  templateId: string;
  studentId: string;
  startDate: Date;
  endDate?: Date | null;
  status?: EnrolmentStatus;
  planId: string;
};

export async function createEnrolment(input: CreateEnrolmentInput) {
  
  await getOrCreateUser()
  await requireAdmin()

  const [template, plan, student] = await Promise.all([
    prisma.classTemplate.findUnique({ where: { id: input.templateId }, select: { levelId: true } }),
    prisma.enrolmentPlan.findUnique({ where: { id: input.planId }, select: { id: true, levelId: true, billingType: true, enrolmentType: true, blockLength: true } }),
    prisma.student.findUnique({ where: { id: input.studentId }, select: { levelId: true } }),
  ]);

  if (!template) throw new Error("Class template not found");
  if (!plan) throw new Error("Enrolment plan not found");
  if (plan.levelId !== template.levelId) throw new Error("Plan level must match class level");
  if (student?.levelId && student.levelId !== plan.levelId) {
    throw new Error("Plan level must match student level");
  }

  const resolvedEndDate = resolveEndDate({
    billingType: plan.billingType,
    enrolmentType: plan.enrolmentType,
    blockLength: plan.blockLength,
    explicitEnd: input.endDate,
    startDate: input.startDate,
  });

  const enrolment = await prisma.enrolment.create({
    data: {
      templateId: input.templateId,
      studentId: input.studentId,
      startDate: input.startDate,
      endDate: resolvedEndDate,
      status: input.status ?? "ACTIVE",
      planId: input.planId,
    },
  });

  revalidatePath(`/admin/class/${input.templateId}`);
  revalidatePath(`/admin/student/${input.studentId}`);
  return enrolment;
}

function resolveEndDate(params: {
  billingType: BillingType;
  enrolmentType: EnrolmentType;
  blockLength: number | null;
  explicitEnd?: Date | null;
  startDate: Date;
}) {
  const { billingType, enrolmentType, blockLength, explicitEnd, startDate } = params;
  if (explicitEnd) return explicitEnd;
  if (billingType === "PER_CLASS") return startDate;
  if (enrolmentType === "BLOCK" && blockLength && Number.isFinite(blockLength)) {
    return null; // block credits tracked elsewhere; keep enrolment open-ended
  }
  return null;
}
