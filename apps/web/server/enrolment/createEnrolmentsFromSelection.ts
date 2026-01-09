"use server";

import { revalidatePath } from "next/cache";
import { isAfter, isBefore, startOfDay } from "date-fns";
import { BillingType, EnrolmentStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInitialInvoiceForEnrolment } from "@/server/invoicing";
import {
  getSelectionRequirement,
  initialAccountingForPlan,
  normalizePlan,
  normalizeStartDate,
  resolvePlannedEndDate,
} from "./planRules";
import { validateSelection } from "./validateSelection";
import { validateNoDuplicateEnrolments } from "./enrolmentValidation";
import { assertPlanMatchesTemplates } from "./planCompatibility";
import { recomputeEnrolmentComputedFields } from "@/server/billing/enrolmentBilling";

/**
 * Findings + Proposed Fix
 * - /admin/class and /admin/student enrolment dialogs both funnel through enrolStudentWithPlan, which
 *   auto-enrols PER_WEEK plans into every active class at the level, ignores multi-session rules, and
 *   never checks for overlapping enrolments.
 * - createEnrolment sets per-class end dates to the start date, skips start-of-day normalization, and
 *   always invoices without aligning paidThrough/credits to billing type.
 * - Billing relies on createInitialInvoiceForEnrolment (coverage windows & entitlements) and attendance/
 *   cancellation flows compare against startOfDay-normalized windows.
 * - This module centralizes validation, date normalization, overlap checks, and enrolment creation so
 *   every entry point uses identical, predictable rules.
 */

const payloadSchema = z.object({
  studentId: z.string().min(1),
  planId: z.string().min(1),
  templateIds: z.array(z.string().min(1)).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  status: z.nativeEnum(EnrolmentStatus).optional(),
  effectiveLevelId: z.string().optional().nullable(),
});

export async function createEnrolmentsFromSelection(
  input: z.input<typeof payloadSchema>,
  options?: { skipAuth?: boolean }
) {
  if (!options?.skipAuth) {
    await getOrCreateUser();
    await requireAdmin();
  }

  const payload = payloadSchema.parse(input);
  const startDate = normalizeStartDate(payload.startDate ?? new Date());
  const explicitEndDate = payload.endDate ? normalizeStartDate(payload.endDate) : undefined;
  const templateIdsInput = Array.from(new Set(payload.templateIds ?? []));

  const [plan, student] = await Promise.all([
    prisma.enrolmentPlan.findUnique({ where: { id: payload.planId } }),
    prisma.student.findUnique({ where: { id: payload.studentId }, select: { id: true, levelId: true } }),
  ]);

  if (!plan) throw new Error("Enrolment plan not found.");
  if (!student) throw new Error("Student not found.");
  const effectiveLevelId = payload.effectiveLevelId ?? student.levelId ?? null;
  if (!effectiveLevelId) {
    throw new Error("Set the student's level before creating an enrolment.");
  }
  if (plan.levelId !== effectiveLevelId) {
    throw new Error("Enrolment plan level must match the selected level.");
  }

  if (plan.billingType === BillingType.PER_WEEK && !plan.durationWeeks) {
    throw new Error("Weekly plans require durationWeeks.");
  }
  if (plan.billingType === BillingType.PER_CLASS && plan.blockClassCount != null && plan.blockClassCount <= 0) {
    throw new Error("PER_CLASS plans require a positive class count when blockClassCount is set.");
  }

  let templateIds = templateIdsInput;
  if (plan.billingType === BillingType.PER_WEEK) {
    if (templateIds.length > 1) {
      throw new Error("Weekly plans only need one anchor class.");
    }
  } else if (!templateIds.length) {
    throw new Error("Select at least one class for this plan.");
  }

  let templates =
    templateIds.length > 0
      ? await prisma.classTemplate.findMany({
          where: { id: { in: templateIds } },
          select: {
            id: true,
            levelId: true,
            active: true,
            startDate: true,
            endDate: true,
            name: true,
            dayOfWeek: true,
          },
        })
      : [];

  if (plan.billingType === BillingType.PER_WEEK && templates.length === 0) {
    const anchorTemplate = await prisma.classTemplate.findFirst({
      where: {
        levelId: plan.levelId,
        active: true,
        startDate: { lte: startDate },
        OR: [{ endDate: null }, { endDate: { gte: startDate } }],
      },
      select: {
        id: true,
        levelId: true,
        active: true,
        startDate: true,
        endDate: true,
        name: true,
        dayOfWeek: true,
      },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });

    if (!anchorTemplate) {
      throw new Error("No active classes are available for this level. Add a class first.");
    }

    templateIds = [anchorTemplate.id];
    templates = [anchorTemplate];
  }

  if (templates.length !== templateIds.length) {
    throw new Error("Some selected classes could not be found.");
  }

  const missingLevelTemplate = templates.find((template) => !template.levelId);
  if (missingLevelTemplate) {
    throw new Error("Selected classes must have a level set before enrolling.");
  }
  const mismatchedTemplate = templates.find((template) => template.levelId && template.levelId !== effectiveLevelId);
  if (mismatchedTemplate) {
    throw new Error("Selected classes must match the student's level.");
  }

  assertPlanMatchesTemplates(plan, templates);

  const selectionCheck = validateSelection({ plan, templateIds, templates });
  if (!selectionCheck.ok) {
    throw new Error(selectionCheck.message ?? "Invalid selection for plan.");
  }

  const normalizedPlan = normalizePlan(plan);
  const windows = templates.map((template) => {
    const templateStart = startOfDay(template.startDate);
    const templateEnd = template.endDate ? startOfDay(template.endDate) : null;
    const alignedStart = isBefore(startDate, templateStart) ? templateStart : startDate;
    if (templateEnd && isAfter(alignedStart, templateEnd)) {
      throw new Error(`Start date is after the class template ends for ${template.name ?? "class"}.`);
    }

    const endDate = resolvePlannedEndDate(plan, alignedStart, explicitEndDate, templateEnd);
    if (endDate && isBefore(endDate, alignedStart)) {
      throw new Error("End date must be on or after the start date.");
    }
    if (endDate && templateEnd && isAfter(endDate, templateEnd)) {
      return { templateId: template.id, startDate: alignedStart, endDate: templateEnd };
    }
    return { templateId: template.id, startDate: alignedStart, endDate };
  });

  const existing = await prisma.enrolment.findMany({
    where: {
      studentId: payload.studentId,
      templateId: { in: templateIds },
      status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] },
    },
    select: {
      id: true,
      templateId: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  });

  validateNoDuplicateEnrolments({
    candidateWindows: windows.map((window) => ({
      ...window,
      templateName: templates.find((t) => t.id === window.templateId)?.name ?? "class",
    })),
    existingEnrolments: existing,
  });

  const status = payload.status ?? EnrolmentStatus.ACTIVE;
  const created = await prisma.$transaction(async (tx) => {
    const enrolments = [];
    for (const window of windows) {
      const accounting = initialAccountingForPlan(normalizedPlan, window.startDate);
      const enrolment = await tx.enrolment.create({
        data: {
          templateId: window.templateId,
          studentId: payload.studentId,
          startDate: window.startDate,
          endDate: window.endDate,
          status,
          planId: plan.id,
          paidThroughDate: accounting.paidThroughDate,
          creditsRemaining: accounting.creditsRemaining,
          creditsBalanceCached: accounting.creditsRemaining ?? null,
          paidThroughDateComputed: accounting.paidThroughDate ?? null,
        },
      });
      await createInitialInvoiceForEnrolment(enrolment.id, { prismaClient: tx, skipAuth: true });
      await recomputeEnrolmentComputedFields(enrolment.id, { client: tx });
      enrolments.push(enrolment);
    }
    return enrolments;
  });

  revalidatePath(`/admin/student/${payload.studentId}`);
  templateIds.forEach((id) => revalidatePath(`/admin/class/${id}`));
  revalidatePath("/admin/enrolment");

  return { enrolments: created, requirement: getSelectionRequirement(plan) };
}
