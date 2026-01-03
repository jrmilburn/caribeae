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
  templateIds: z.array(z.string().min(1)).min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
  status: z.nativeEnum(EnrolmentStatus).optional(),
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
  const templateIds = Array.from(new Set(payload.templateIds));

  const [plan, student, templates] = await Promise.all([
    prisma.enrolmentPlan.findUnique({ where: { id: payload.planId } }),
    prisma.student.findUnique({ where: { id: payload.studentId }, select: { id: true, levelId: true } }),
    prisma.classTemplate.findMany({
      where: { id: { in: templateIds } },
      select: {
        id: true,
        levelId: true,
        active: true,
        startDate: true,
        endDate: true,
        name: true,
      },
    }),
  ]);

  if (!plan) throw new Error("Enrolment plan not found.");
  if (!student) throw new Error("Student not found.");
  if (plan.levelId !== student.levelId && student.levelId) {
    throw new Error("Plan level must match the student level.");
  }

  if (plan.billingType === BillingType.PER_WEEK && !plan.durationWeeks) {
    throw new Error("Weekly plans require durationWeeks.");
  }
  if (plan.billingType === BillingType.PER_CLASS && plan.blockClassCount != null && plan.blockClassCount <= 0) {
    throw new Error("PER_CLASS plans require a positive class count when blockClassCount is set.");
  }

  if (templates.length !== templateIds.length) {
    throw new Error("Some selected classes could not be found.");
  }

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
      status: { not: EnrolmentStatus.CANCELLED },
    },
    select: {
      id: true,
      templateId: true,
      startDate: true,
      endDate: true,
      status: true,
    },
  });

  const overlapping = existing.filter((row) => {
    const window = windows.find((w) => w.templateId === row.templateId);
    if (!window) return false;
    return overlaps(window.startDate, window.endDate, startOfDay(row.startDate), row.endDate ? startOfDay(row.endDate) : null);
  });

  if (overlapping.length) {
    const templateNames = overlapping
      .map((o) => templates.find((t) => t.id === o.templateId)?.name ?? "class")
      .join(", ");
    throw new Error(`Student is already enrolled in ${templateNames} for the selected dates.`);
  }

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
      enrolments.push(enrolment);
    }
    return enrolments;
  });

  revalidatePath(`/admin/student/${payload.studentId}`);
  templateIds.forEach((id) => revalidatePath(`/admin/class/${id}`));
  revalidatePath("/admin/enrolment");

  return { enrolments: created, requirement: getSelectionRequirement(plan) };
}

function overlaps(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null) {
  const aEndSafe = aEnd ?? new Date(8640000000000000);
  const bEndSafe = bEnd ?? new Date(8640000000000000);
  return aStart <= bEndSafe && bStart <= aEndSafe;
}
