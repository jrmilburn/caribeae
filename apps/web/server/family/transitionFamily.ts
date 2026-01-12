"use server";

import { z } from "zod";
import { BillingType, EnrolmentCreditEventType, EnrolmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeStartDate } from "@/server/enrolment/planRules";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";

const studentTransitionSchema = z.object({
  studentId: z.string().min(1),
  planId: z.string().min(1),
  classTemplateId: z.string().min(1),
  startDate: z.coerce.date(),
  paidThroughDate: z.coerce.date(),
  credits: z.number().int().optional().nullable(),
});

const transitionFamilySchema = z.object({
  familyId: z.string().min(1),
  effectiveDate: z.coerce.date().optional(),
  openingBalanceCents: z.number().int(),
  notes: z.string().trim().max(2000).optional(),
  batchId: z.string().trim().max(200).optional(),
  force: z.boolean().optional(),
  students: z.array(studentTransitionSchema).nonempty(),
});

export type TransitionFamilyInput = z.infer<typeof transitionFamilySchema>;

export async function transitionFamily(input: TransitionFamilyInput) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = transitionFamilySchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.accountOpeningState.findUnique({
      where: { familyId: payload.familyId },
    });

    if (existing) {
      if (!payload.force) {
        throw new Error("Family has already been transitioned.");
      }
      return { openingState: existing, enrolmentIds: [] as string[] };
    }

    const family = await tx.family.findUnique({ where: { id: payload.familyId } });
    if (!family) {
      throw new Error("Family not found.");
    }

    const studentIds = payload.students.map((student) => student.studentId);
    const students = await tx.student.findMany({
      where: { id: { in: studentIds }, familyId: payload.familyId },
      select: { id: true },
    });

    if (students.length !== studentIds.length) {
      throw new Error("Selected students do not belong to this family.");
    }

    const planIds = payload.students.map((student) => student.planId);
    const templateIds = payload.students.map((student) => student.classTemplateId);

    const [plans, templates] = await Promise.all([
      tx.enrolmentPlan.findMany({ where: { id: { in: planIds } } }),
      tx.classTemplate.findMany({ where: { id: { in: templateIds } } }),
    ]);

    const planMap = new Map(plans.map((plan) => [plan.id, plan]));
    const templateMap = new Map(templates.map((template) => [template.id, template]));

    const enrolmentIds: string[] = [];

    for (const selection of payload.students) {
      const plan = planMap.get(selection.planId);
      const template = templateMap.get(selection.classTemplateId);

      if (!plan || !template) {
        throw new Error("Missing enrolment plan or class template.");
      }

      assertPlanMatchesTemplate(plan, template);

      const normalizedStart = normalizeStartDate(selection.startDate);
      const paidThrough = normalizeStartDate(selection.paidThroughDate);

      const enrolment = await tx.enrolment.create({
        data: {
          studentId: selection.studentId,
          planId: plan.id,
          templateId: template.id,
          startDate: normalizedStart,
          status: EnrolmentStatus.ACTIVE,
          paidThroughDate: paidThrough,
        },
      });

      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: { billingGroupId: enrolment.id },
      });

      await tx.enrolmentClassAssignment.create({
        data: { enrolmentId: enrolment.id, templateId: template.id },
      });

      if (plan.billingType === BillingType.PER_CLASS) {
        const credits = selection.credits ?? 0;
        if (credits < 0) {
          throw new Error("Credits must be zero or positive.");
        }
        if (credits > 0) {
          await tx.enrolmentCreditEvent.create({
            data: {
              enrolmentId: enrolment.id,
              type: EnrolmentCreditEventType.MANUAL_ADJUST,
              creditsDelta: credits,
              occurredOn: normalizedStart,
              note: "Opening credits",
            },
          });
        }
      }
      enrolmentIds.push(enrolment.id);
    }

    const openingState = await tx.accountOpeningState.create({
      data: {
        familyId: payload.familyId,
        effectiveDate: normalizeStartDate(payload.effectiveDate ?? new Date()),
        createdById: user.id,
        openingBalanceCents: payload.openingBalanceCents,
        notes: payload.notes?.trim() || null,
        batchId: payload.batchId?.trim() || null,
      },
    });

    return { openingState, enrolmentIds };
  });
}
