// /server/enrolment/createEnrolment.ts
"use server";

import { prisma } from "@/lib/prisma";
import { BillingType, EnrolmentStatus } from "@prisma/client";
import { z } from "zod";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInitialInvoiceForEnrolment } from "@/server/invoicing";

type CreateEnrolmentInput = {
  templateId: string;
  studentId: string;
  startDate: Date;
  endDate?: Date | null;
  status?: EnrolmentStatus;
  planId: string;
};

const createEnrolmentInputSchema = z.object({
  templateId: z.string().min(1),
  studentId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  status: z.nativeEnum(EnrolmentStatus).optional(),
  planId: z.string().min(1),
});

export async function createEnrolment(input: CreateEnrolmentInput, options?: { skipAuth?: boolean }) {
  const payload = createEnrolmentInputSchema.parse(input);

  if (!options?.skipAuth) {
    await getOrCreateUser();
    await requireAdmin();
  }

  const [template, plan, student] = await Promise.all([
    prisma.classTemplate.findUnique({ where: { id: payload.templateId }, select: { levelId: true } }),
    prisma.enrolmentPlan.findUnique({
      where: { id: payload.planId },
      select: {
        id: true,
        levelId: true,
        billingType: true,
        durationWeeks: true,
        blockClassCount: true,
      },
    }),
    prisma.student.findUnique({ where: { id: payload.studentId }, select: { levelId: true } }),
  ]);

  if (!template) throw new Error("Class template not found");
  if (!plan) throw new Error("Enrolment plan not found");
  if (plan.levelId !== template.levelId) throw new Error("Plan level must match class level");
  if (student?.levelId && student.levelId !== plan.levelId) {
    throw new Error("Plan level must match student level");
  }

  if (plan.billingType === BillingType.PER_WEEK && !plan.durationWeeks) {
    throw new Error("Weekly plans require durationWeeks");
  }
  if (plan.billingType === BillingType.BLOCK && !plan.blockClassCount) {
    throw new Error("Block plans require a class count");
  }

  const resolvedEndDate = resolveEndDate({
    billingType: plan.billingType,
    explicitEnd: payload.endDate,
    startDate: payload.startDate,
  });

  const enrolment = await prisma.$transaction(async (tx) => {
    const created = await tx.enrolment.create({
      data: {
        templateId: payload.templateId,
        studentId: payload.studentId,
        startDate: payload.startDate,
        endDate: resolvedEndDate,
        status: payload.status ?? "ACTIVE",
        planId: payload.planId,
      },
    });

    await createInitialInvoiceForEnrolment(created.id, { prismaClient: tx, skipAuth: true });
    return created;
  });

  return enrolment;
}

function resolveEndDate(params: {
  billingType: BillingType;
  explicitEnd?: Date | null;
  startDate: Date;
}) {
  const { billingType, explicitEnd, startDate } = params;
  if (explicitEnd) return explicitEnd;
  if (billingType === "PER_CLASS") return startDate;
  return null;
}
