"use server";

import { revalidatePath } from "next/cache";
import { EnrolmentStatus } from "@prisma/client";
import { addDays, isAfter, isBefore, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getSelectionRequirement, normalizeStartDate, resolvePlannedEndDate } from "@/server/enrolment/planRules";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { validateSelection } from "@/server/enrolment/validateSelection";
import {
  CoverageWouldShortenError,
  wouldShortenCoverage,
} from "@/server/billing/recalculateEnrolmentCoverage";
import { adjustCreditsForManualPaidThroughDate } from "@/server/billing/enrolmentBilling";
import { describeTemplate } from "@/server/billing/paidThroughTemplateChange";
import { EnrolmentValidationError, validateNoDuplicateEnrolments } from "./enrolmentValidation";
import { assertPlanMatchesTemplates } from "./planCompatibility";
import { getCapacityIssueForTemplateRange } from "@/server/class/capacity";
import type { CapacityExceededDetails } from "@/lib/capacityError";
import {
  applyClassChangeSettlement,
  buildClassChangeSettlementKey,
  computeClassChangeSettlementForRange,
  resolveChangeOverPaidThroughDate,
  type ClassChangeSettlementSummary,
} from "@/server/billing/classChangeSettlement";

type ChangeEnrolmentInput = {
  enrolmentId: string;
  templateIds: string[];
  startDate?: string;
  effectiveLevelId?: string | null;
  planId?: string | null;
  confirmShorten?: boolean;
  allowOverload?: boolean;
};

type PreviewChangeEnrolmentInput = {
  enrolmentId: string;
  templateIds: string[];
  startDate?: string;
  effectiveLevelId?: string | null;
  planId?: string | null;
};

type ChangeEnrolmentResult =
  | {
      ok: true;
      data: {
        enrolments: Array<{
          id: string;
          studentId: string;
          familyId: string | null;
          templateId: string | null;
        }>;
        templateIds: string[];
        studentId: string;
        familyId: string | null;
        originalTemplates: string[];
        oldTemplates: Array<{ id: string; name: string; dayOfWeek: number | null }>;
        newTemplates: Array<{ id: string; name: string; dayOfWeek: number | null }>;
        settlement: ClassChangeSettlementSummary;
        settlementInvoiceId: string | null;
        settlementPaymentId: string | null;
      };
    }
  | {
      ok: false;
      error:
        | {
            code: "COVERAGE_WOULD_SHORTEN";
            oldDateKey: string | null;
            newDateKey: string | null;
          }
        | {
            code: "CAPACITY_EXCEEDED";
            details: CapacityExceededDetails;
          }
        | {
            code: "VALIDATION_ERROR" | "UNKNOWN_ERROR";
            message: string;
          };
    };

export async function changeEnrolment(input: ChangeEnrolmentInput): Promise<ChangeEnrolmentResult> {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = {
    enrolmentId: input.enrolmentId,
    templateIds: Array.from(new Set(input.templateIds)),
    startDate: input.startDate ? normalizeStartDate(input.startDate) : null,
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const enrolment = await tx.enrolment.findUnique({
        where: { id: payload.enrolmentId },
        include: {
          plan: true,
          student: true,
          template: true,
          classAssignments: {
            include: {
              template: true,
            },
          },
        },
      });

    if (!enrolment) throw new Error("Enrolment not found.");
    if (!enrolment.plan) throw new Error("Enrolment plan missing.");

    const selectedPlan = input.planId
      ? await tx.enrolmentPlan.findUnique({ where: { id: input.planId } })
      : enrolment.plan;
    if (!selectedPlan) throw new Error("Selected enrolment plan not found.");
    if (selectedPlan.billingType !== enrolment.plan.billingType) {
      throw new Error("Enrolment plan type must match the current enrolment billing type.");
    }

    const effectiveLevelId = input.effectiveLevelId ?? enrolment.student?.levelId ?? null;
    if (!effectiveLevelId) {
      throw new Error("Set the student's level before changing this enrolment.");
    }
    if (selectedPlan.levelId !== effectiveLevelId) {
      throw new Error("Enrolment plan level must match the selected level.");
    }

    let templateIds = payload.templateIds;
    let templates: Array<{
      id: string;
      levelId: string;
      active: boolean | null;
      startDate: Date;
      endDate: Date | null;
      name: string | null;
      dayOfWeek: number | null;
      startTime: number | null;
      capacity: number | null;
    }> = [];

    if (selectedPlan.billingType === "PER_WEEK") {
      templates = await tx.classTemplate.findMany({
        where: {
          levelId: selectedPlan.levelId,
          active: true,
          startDate: { lte: payload.startDate ?? startOfDay(enrolment.startDate) },
          OR: [{ endDate: null }, { endDate: { gte: payload.startDate ?? startOfDay(enrolment.startDate) } }],
        },
        select: {
          id: true,
          levelId: true,
          active: true,
          startDate: true,
          endDate: true,
          name: true,
          dayOfWeek: true,
          startTime: true,
          capacity: true,
        },
      });

      if (!templates.length) {
        throw new Error("No active classes are available for this level. Add a class first.");
      }

      templateIds = templates.map((template) => template.id);
    } else {
      if (!templateIds.length) {
        throw new Error("Select at least one class template.");
      }

      templates = await tx.classTemplate.findMany({
        where: { id: { in: templateIds } },
        select: {
          id: true,
          levelId: true,
          active: true,
          startDate: true,
          endDate: true,
          name: true,
          dayOfWeek: true,
          startTime: true,
          capacity: true,
        },
      });
    }

    const missingLevelTemplate = templates.find((template) => !template.levelId);
    if (missingLevelTemplate) {
      throw new Error("Selected classes must have a level set before enrolling.");
    }

    const mismatchedTemplate = templates.find(
      (template) => template.levelId && template.levelId !== effectiveLevelId
    );
    if (mismatchedTemplate) {
      throw new Error("Selected classes must match the student's level.");
    }

    assertPlanMatchesTemplates(selectedPlan, templates);

    if (selectedPlan.billingType !== "PER_WEEK") {
      const selectionValidation = validateSelection({
        plan: selectedPlan,
        templateIds,
        templates,
      });

      if (!selectionValidation.ok) {
        throw new Error(selectionValidation.message ?? "Invalid selection for enrolment plan.");
      }

      const selectionRequirement = getSelectionRequirement(selectedPlan);
      if (selectionRequirement.requiredCount > 0 && templateIds.length !== selectionRequirement.requiredCount) {
        throw new Error(`Select ${selectionRequirement.requiredCount} classes for this plan.`);
      }
      if (selectionRequirement.requiredCount === 0 && templateIds.length > selectionRequirement.maxCount) {
        throw new Error(`Select up to ${selectionRequirement.maxCount} classes for this plan.`);
      }
    }

    // -----------------------------
    // Dates / windows (NO redeclares)
    // -----------------------------
    const baseStart = payload.startDate ?? startOfDay(enrolment.startDate);

    // This is a LIMIT/CAP used when validating windows, not necessarily the final planned end date.
    const currentEndLimit = enrolment.endDate ? startOfDay(enrolment.endDate) : null;

    const windows = templates.map((template) => {
      const templateStart = startOfDay(template.startDate);
      const templateEnd = template.endDate ? startOfDay(template.endDate) : null;

      // enrolment can't start before template starts
      const startDate = baseStart < templateStart ? templateStart : baseStart;

      // end date can't exceed either existing enrolment end (if any) or template end (if any)
      let endDate = currentEndLimit;
      if (templateEnd && (!endDate || isAfter(endDate, templateEnd))) {
        endDate = templateEnd;
      }

      if (endDate && isAfter(startDate, endDate)) {
        throw new EnrolmentValidationError({
          code: "INVALID_DATE_RANGE",
          templateId: template.id,
          message: `Start date must be on or before the class end date for ${template.name ?? "this class"}.`,
        });
      }

      return {
        templateId: template.id,
        templateName: template.name ?? "class",
        startDate,
        endDate,
      };
    });

    const existing = await tx.enrolment.findMany({
      where: {
        studentId: enrolment.studentId,
        OR: [
          { templateId: { in: templateIds } },
          { classAssignments: { some: { templateId: { in: templateIds } } } },
        ],
        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED, EnrolmentStatus.CHANGEOVER] },
      },
      select: { id: true, templateId: true, startDate: true, endDate: true, status: true },
    });

    validateNoDuplicateEnrolments({
      candidateWindows: windows,
      existingEnrolments: existing,
      ignoreEnrolmentIds: new Set([enrolment.id]),
    });

    let capacityIssue: CapacityExceededDetails | null = null;
    for (const window of windows) {
      const template = templates.find((item) => item.id === window.templateId);
      if (!template) continue;
      const issue = await getCapacityIssueForTemplateRange({
        template,
        plan: selectedPlan,
        windowStart: window.startDate,
        windowEnd: window.endDate ?? null,
        existingEnrolmentId: enrolment.id,
        client: tx,
      });
      if (issue) {
        capacityIssue = issue;
        break;
      }
    }
    if (capacityIssue && !input.allowOverload) {
      return { capacityIssue };
    }
    if (capacityIssue && input.allowOverload) {
      console.info("[capacity] overload confirmed for changeEnrolment", {
        templateId: capacityIssue.templateId,
        occurrenceDateKey: capacityIssue.occurrenceDateKey,
        capacity: capacityIssue.capacity,
        currentCount: capacityIssue.currentCount,
        projectedCount: capacityIssue.projectedCount,
      });
    }

    const anchorTemplate = resolveAnchorTemplate(templates);

    const oldTemplates = enrolment.classAssignments.length
      ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
      : enrolment.template
        ? [enrolment.template]
        : [];

    // Compute the earliest template end date (if any) to cap the planned end date.
    const templateEndDates = windows.map((w) => w.endDate).filter(Boolean) as Date[];
    const earliestEnd =
      templateEndDates.length > 0
        ? templateEndDates.reduce((acc, end) => (acc < end ? acc : end))
        : null;

    const plannedEndDate = resolvePlannedEndDate(selectedPlan, baseStart, enrolment.endDate ?? null, earliestEnd);

    const endBoundary = addDays(baseStart, -1);
    const enrolmentStart = startOfDay(enrolment.startDate);
    const effectiveEnd = isBefore(endBoundary, enrolmentStart) ? enrolmentStart : endBoundary;

    const currentPaidThrough = resolveChangeOverPaidThroughDate(
      enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null
    );

    const nextEnrolment = await tx.enrolment.create({
      data: {
        templateId: anchorTemplate?.id ?? enrolment.templateId,
        studentId: enrolment.studentId,
        startDate: baseStart,
        endDate: plannedEndDate,
        status: EnrolmentStatus.ACTIVE,
        planId: selectedPlan.id,
        billingGroupId: enrolment.billingGroupId ?? null,
        paidThroughDate: currentPaidThrough,
        paidThroughDateComputed: currentPaidThrough,
        creditsRemaining: selectedPlan.billingType === "PER_CLASS" ? 0 : null,
        creditsBalanceCached: selectedPlan.billingType === "PER_CLASS" ? 0 : null,
      },
      include: {
        student: true,
        template: true,
        plan: true,
        classAssignments: {
          include: {
            template: true,
          },
        },
      },
    });

    await tx.enrolmentClassAssignment.createMany({
      data: templateIds.map((templateId) => ({
        enrolmentId: nextEnrolment.id,
        templateId,
      })),
      skipDuplicates: true,
    });

    if (selectedPlan.billingType === "PER_CLASS") {
      await adjustCreditsForManualPaidThroughDate(tx, nextEnrolment, currentPaidThrough);
    }

    await tx.enrolment.update({
      where: { id: enrolment.id },
      data: {
        endDate: effectiveEnd,
        status: EnrolmentStatus.CHANGEOVER,
        cancelledAt: null,
      },
    });

    const settlement = await computeClassChangeSettlementForRange({
      client: tx,
      oldPlan: enrolment.plan,
      newPlan: selectedPlan,
      changeOverDate: baseStart,
      paidThroughDate: currentPaidThrough,
      templates: templates.map((template) => ({
        id: template.id,
        dayOfWeek: template.dayOfWeek ?? null,
        levelId: template.levelId ?? null,
      })),
    });

    if (!input.confirmShorten && wouldShortenCoverage(currentPaidThrough, settlement.paidThroughDate)) {
      throw new CoverageWouldShortenError({
        oldDateKey: currentPaidThrough ? toBrisbaneDayKey(brisbaneStartOfDay(currentPaidThrough)) : null,
        newDateKey: settlement.paidThroughDate ? toBrisbaneDayKey(brisbaneStartOfDay(settlement.paidThroughDate)) : null,
      });
    }

    const settlementKey = buildClassChangeSettlementKey({
      enrolmentId: enrolment.id,
      newPlanId: selectedPlan.id,
      changeOverDate: baseStart,
      paidThroughDate: currentPaidThrough,
      templateIds,
    });
    if (settlement.differenceCents !== 0 && !enrolment.student?.familyId) {
      throw new Error("Family not found for settlement.");
    }

    const settlementResult = await applyClassChangeSettlement({
      client: tx,
      familyId: enrolment.student?.familyId ?? "",
      enrolmentId: nextEnrolment.id,
      settlement,
      settlementKey,
      planId: selectedPlan.id,
    });

    return {
      data: {
        enrolments: [
          {
            id: nextEnrolment.id,
            studentId: nextEnrolment.studentId,
            familyId: nextEnrolment.student?.familyId ?? null,
            templateId: nextEnrolment.templateId,
          },
        ],
        templateIds,
        studentId: enrolment.studentId,
        familyId: enrolment.student?.familyId ?? null,
        originalTemplates: enrolment.classAssignments.map((a) => a.templateId),
        oldTemplates: oldTemplates.map((template) => describeTemplate(template)),
        newTemplates: templates.map((template) => describeTemplate(template)),
        settlement,
        settlementInvoiceId: settlementResult.invoiceId,
        settlementPaymentId: settlementResult.paymentId,
      },
    };
  });

    if ("capacityIssue" in result && result.capacityIssue) {
      console.info("[capacity] exceeded for changeEnrolment", {
        templateId: result.capacityIssue.templateId,
        occurrenceDateKey: result.capacityIssue.occurrenceDateKey,
        capacity: result.capacityIssue.capacity,
        currentCount: result.capacityIssue.currentCount,
        projectedCount: result.capacityIssue.projectedCount,
      });
      return {
        ok: false,
        error: { code: "CAPACITY_EXCEEDED", details: result.capacityIssue },
      };
    }

    const allTemplates = new Set<string>([...result.data.templateIds, ...result.data.originalTemplates]);
    result.data.enrolments.forEach((e) => {
      if (e.templateId) allTemplates.add(e.templateId);
    });

    revalidatePath(`/admin/student/${result.data.studentId}`);
    allTemplates.forEach((id) => revalidatePath(`/admin/class/${id}`));
    if (result.data.familyId) {
      revalidatePath(`/admin/family/${result.data.familyId}`);
    }
    revalidatePath("/admin/enrolment");

    return { ok: true as const, data: result.data };
  } catch (error) {
    if (error instanceof CoverageWouldShortenError) {
      return {
        ok: false as const,
        error: {
          code: "COVERAGE_WOULD_SHORTEN",
          oldDateKey: error.oldDateKey,
          newDateKey: error.newDateKey,
        },
      };
    }
    if (error instanceof Error) {
      return {
        ok: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message || "Unable to change enrolment.",
        },
      };
    }
    return {
      ok: false as const,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Unable to change enrolment.",
      },
    };
  }
}

export async function previewChangeEnrolment(input: PreviewChangeEnrolmentInput) {
  await requireAdmin();

  const enrolment = await prisma.enrolment.findUnique({
    where: { id: input.enrolmentId },
    include: {
      plan: true,
      student: true,
      template: true,
      classAssignments: {
        include: {
          template: true,
        },
      },
    },
  });

  if (!enrolment) throw new Error("Enrolment not found.");
  if (!enrolment.plan) throw new Error("Enrolment plan missing.");

  const selectedPlan = input.planId
    ? await prisma.enrolmentPlan.findUnique({ where: { id: input.planId } })
    : enrolment.plan;
  if (!selectedPlan) throw new Error("Selected enrolment plan not found.");
  if (selectedPlan.billingType !== enrolment.plan.billingType) {
    throw new Error("Enrolment plan type must match the current enrolment billing type.");
  }

  const effectiveLevelId = input.effectiveLevelId ?? enrolment.student?.levelId ?? null;
  if (!effectiveLevelId) {
    throw new Error("Set the student's level before changing this enrolment.");
  }
  if (selectedPlan.levelId !== effectiveLevelId) {
    throw new Error("Enrolment plan level must match the selected level.");
  }

  const baseStart = input.startDate ? normalizeStartDate(input.startDate) : startOfDay(enrolment.startDate);
  let templateIds = Array.from(new Set(input.templateIds));
  let templates: Array<{
    id: string;
    levelId: string;
    active: boolean | null;
    startDate: Date;
    endDate: Date | null;
    name: string | null;
    dayOfWeek: number | null;
  }> = [];

  if (selectedPlan.billingType === "PER_WEEK") {
    templates = await prisma.classTemplate.findMany({
      where: {
        levelId: selectedPlan.levelId,
        active: true,
        startDate: { lte: baseStart },
        OR: [{ endDate: null }, { endDate: { gte: baseStart } }],
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
    });

    if (!templates.length) {
      throw new Error("No active classes are available for this level. Add a class first.");
    }

    templateIds = templates.map((template) => template.id);
  } else {
    if (!templateIds.length) {
      throw new Error("Select at least one class template.");
    }

    templates = await prisma.classTemplate.findMany({
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
    });
  }

  assertPlanMatchesTemplates(selectedPlan, templates);

  if (selectedPlan.billingType !== "PER_WEEK") {
    const selectionValidation = validateSelection({
      plan: selectedPlan,
      templateIds,
      templates,
    });

    if (!selectionValidation.ok) {
      throw new Error(selectionValidation.message ?? "Invalid selection for enrolment plan.");
    }

    const selectionRequirement = getSelectionRequirement(selectedPlan);
    if (selectionRequirement.requiredCount > 0 && templateIds.length !== selectionRequirement.requiredCount) {
      throw new Error(`Select ${selectionRequirement.requiredCount} classes for this plan.`);
    }
    if (selectionRequirement.requiredCount === 0 && templateIds.length > selectionRequirement.maxCount) {
      throw new Error(`Select up to ${selectionRequirement.maxCount} classes for this plan.`);
    }
  }

  const oldTemplates = enrolment.classAssignments.length
    ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
    : enrolment.template
      ? [enrolment.template]
      : [];
  const templateEndDates = templates.map((template) => template.endDate).filter(Boolean) as Date[];
  const earliestEnd =
    templateEndDates.length > 0
      ? templateEndDates.reduce((acc, end) => (acc < end ? acc : end))
      : null;
  const plannedEndDate = resolvePlannedEndDate(selectedPlan, baseStart, enrolment.endDate ?? null, earliestEnd);

  const oldPaidThrough = resolveChangeOverPaidThroughDate(
    enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null
  );

  const settlement = await computeClassChangeSettlementForRange({
    client: prisma,
    oldPlan: enrolment.plan,
    newPlan: selectedPlan,
    changeOverDate: baseStart,
    paidThroughDate: oldPaidThrough,
    templates: templates.map((template) => ({
      id: template.id,
      dayOfWeek: template.dayOfWeek ?? null,
      levelId: template.levelId ?? null,
    })),
  });

  const wouldShorten = wouldShortenCoverage(oldPaidThrough, settlement.paidThroughDate);

  return {
    ok: true as const,
    data: {
      oldPaidThroughDateKey: oldPaidThrough ? toBrisbaneDayKey(brisbaneStartOfDay(oldPaidThrough)) : null,
      newPaidThroughDateKey: settlement.paidThroughDate ? toBrisbaneDayKey(brisbaneStartOfDay(settlement.paidThroughDate)) : null,
      oldTemplates: oldTemplates.map((template) => describeTemplate(template)),
      newTemplates: templates.map((template) => describeTemplate(template)),
      wouldShorten,
      settlement,
    },
  };
}

function resolveAnchorTemplate<T extends { id: string; dayOfWeek: number | null }>(
  templates: T[]
): T | null {
  return (
    templates
      .slice()
      .sort((a, b) => {
        const dayA = a.dayOfWeek ?? 7;
        const dayB = b.dayOfWeek ?? 7;
        if (dayA !== dayB) return dayA - dayB;
        return a.id.localeCompare(b.id);
      })[0] ?? null
  );
}
