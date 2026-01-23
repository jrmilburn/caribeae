"use server";

import { revalidatePath } from "next/cache";
import { EnrolmentCreditEventType, EnrolmentStatus } from "@prisma/client";
import type { EnrolmentPlan, Prisma, PrismaClient } from "@prisma/client";
import { addDays, isAfter, isBefore, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getSelectionRequirement, normalizeStartDate, resolvePlannedEndDate } from "@/server/enrolment/planRules";
import { brisbaneCompare, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { validateSelection } from "@/server/enrolment/validateSelection";
import {
  CoverageWouldShortenError,
  recalculateEnrolmentCoverage,
  wouldShortenCoverage,
} from "@/server/billing/recalculateEnrolmentCoverage";
import { getEnrolmentBillingStatus, recomputeEnrolmentComputedFields } from "@/server/billing/enrolmentBilling";
import { describeTemplate } from "@/server/billing/paidThroughTemplateChange";
import { EnrolmentValidationError, validateNoDuplicateEnrolments } from "./enrolmentValidation";
import { assertPlanMatchesTemplates } from "./planCompatibility";
import { getCapacityIssueForTemplateRange } from "@/server/class/capacity";
import type { CapacityExceededDetails } from "@/lib/capacityError";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { buildMissedOccurrencePredicate } from "@/server/billing/missedOccurrence";
import { buildOccurrenceSchedule, consumeOccurrencesForCredits, resolveOccurrenceHorizon } from "@/server/billing/occurrenceWalker";
import {
  computeCoverageEndDay,
  countScheduledSessionsExcludingHolidays,
} from "@/server/billing/coverageEngine";

type ChangeEnrolmentInput = {
  enrolmentId: string;
  templateIds: string[];
  startDate?: string;
  effectiveLevelId?: string | null;
  confirmShorten?: boolean;
  allowOverload?: boolean;
};

type PreviewChangeEnrolmentInput = {
  enrolmentId: string;
  templateIds: string[];
  startDate?: string;
  effectiveLevelId?: string | null;
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

    const effectiveLevelId = input.effectiveLevelId ?? enrolment.student?.levelId ?? null;
    if (!effectiveLevelId) {
      throw new Error("Set the student's level before changing this enrolment.");
    }
    if (enrolment.plan.levelId !== effectiveLevelId) {
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
      startTime?: number | null;
      capacity: number | null;
    }> = [];

    if (enrolment.plan.billingType === "PER_WEEK") {
      templates = await tx.classTemplate.findMany({
        where: {
          levelId: enrolment.plan.levelId,
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

    assertPlanMatchesTemplates(enrolment.plan, templates);

    if (enrolment.plan.billingType !== "PER_WEEK") {
      const selectionValidation = validateSelection({
        plan: enrolment.plan,
        templateIds,
        templates,
      });

      if (!selectionValidation.ok) {
        throw new Error(selectionValidation.message ?? "Invalid selection for enrolment plan.");
      }

      const selectionRequirement = getSelectionRequirement(enrolment.plan);
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
        plan: enrolment.plan,
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

    const plannedEndDate = resolvePlannedEndDate(enrolment.plan, baseStart, enrolment.endDate ?? null, earliestEnd);

    const endBoundary = addDays(baseStart, -1);
    const enrolmentStart = startOfDay(enrolment.startDate);
    const effectiveEnd = isBefore(endBoundary, enrolmentStart) ? enrolmentStart : endBoundary;

    const currentPaidThrough = enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null;
    const carriedPaidThrough =
      enrolment.plan.billingType === "PER_WEEK" && currentPaidThrough
        ? await computeWeeklyChangeoverPaidThrough({
            client: tx,
            changeoverDate: baseStart,
            oldPaidThrough: currentPaidThrough,
            oldTemplates,
            newTemplates: templates,
            plannedEndDate,
            sessionsPerWeek: resolveSessionsPerWeek(enrolment.plan),
          })
        : null;

    const oldSnapshot =
      enrolment.plan.billingType === "PER_CLASS"
        ? await getEnrolmentBillingStatus(enrolment.id, { client: tx, asOfDate: baseStart })
        : null;
    const carriedCredits = oldSnapshot?.remainingCredits ?? enrolment.creditsRemaining ?? enrolment.creditsBalanceCached ?? 0;

    const nextEnrolment = await tx.enrolment.create({
      data: {
        templateId: anchorTemplate?.id ?? enrolment.templateId,
        studentId: enrolment.studentId,
        startDate: baseStart,
        endDate: plannedEndDate,
        status: EnrolmentStatus.ACTIVE,
        planId: enrolment.planId,
        billingGroupId: enrolment.billingGroupId ?? null,
        paidThroughDate: carriedPaidThrough,
        paidThroughDateComputed: carriedPaidThrough,
        creditsRemaining: enrolment.plan.billingType === "PER_CLASS" ? 0 : null,
        creditsBalanceCached: enrolment.plan.billingType === "PER_CLASS" ? 0 : null,
      },
      include: { student: true, template: true, plan: true, classAssignments: true },
    });

    await tx.enrolmentClassAssignment.createMany({
      data: templateIds.map((templateId) => ({
        enrolmentId: nextEnrolment.id,
        templateId,
      })),
      skipDuplicates: true,
    });

    if (enrolment.plan.billingType === "PER_CLASS" && carriedCredits !== 0) {
      await tx.enrolmentCreditEvent.create({
        data: {
          enrolmentId: nextEnrolment.id,
          type: EnrolmentCreditEventType.MANUAL_ADJUST,
          creditsDelta: carriedCredits,
          occurredOn: baseStart,
          note: "Transfer credits from enrolment change",
        },
      });
    }

    const newSnapshot = await recomputeEnrolmentComputedFields(nextEnrolment.id, {
      client: tx,
      asOfDate: baseStart,
    });

    if (!input.confirmShorten && wouldShortenCoverage(currentPaidThrough, newSnapshot.paidThroughDate)) {
      throw new CoverageWouldShortenError({
        oldDateKey: currentPaidThrough ? toBrisbaneDayKey(brisbaneStartOfDay(currentPaidThrough)) : null,
        newDateKey: newSnapshot.paidThroughDate ? toBrisbaneDayKey(brisbaneStartOfDay(newSnapshot.paidThroughDate)) : null,
      });
    }

    await tx.enrolment.update({
      where: { id: enrolment.id },
      data: {
        endDate: effectiveEnd,
        status: EnrolmentStatus.CHANGEOVER,
        cancelledAt: null,
      },
    });

    await recalculateEnrolmentCoverage(nextEnrolment.id, "CLASS_CHANGED", {
      tx,
      actorId: user.id,
      confirmShorten: input.confirmShorten,
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

  const effectiveLevelId = input.effectiveLevelId ?? enrolment.student?.levelId ?? null;
  if (!effectiveLevelId) {
    throw new Error("Set the student's level before changing this enrolment.");
  }
  if (enrolment.plan.levelId !== effectiveLevelId) {
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

  if (enrolment.plan.billingType === "PER_WEEK") {
    templates = await prisma.classTemplate.findMany({
      where: {
        levelId: enrolment.plan.levelId,
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

  assertPlanMatchesTemplates(enrolment.plan, templates);

  if (enrolment.plan.billingType !== "PER_WEEK") {
    const selectionValidation = validateSelection({
      plan: enrolment.plan,
      templateIds,
      templates,
    });

    if (!selectionValidation.ok) {
      throw new Error(selectionValidation.message ?? "Invalid selection for enrolment plan.");
    }

    const selectionRequirement = getSelectionRequirement(enrolment.plan);
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
  const plannedEndDate = resolvePlannedEndDate(enrolment.plan, baseStart, enrolment.endDate ?? null, earliestEnd);

  const oldPaidThrough = enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null;
  let newPaidThroughDate = oldPaidThrough ?? null;

  if (enrolment.plan.billingType === "PER_WEEK" && oldPaidThrough) {
    newPaidThroughDate = await computeWeeklyChangeoverPaidThrough({
      client: prisma,
      changeoverDate: baseStart,
      oldPaidThrough,
      oldTemplates,
      newTemplates: templates,
      plannedEndDate,
      sessionsPerWeek: resolveSessionsPerWeek(enrolment.plan),
    });
  } else if (enrolment.plan.billingType !== "PER_WEEK") {
    const oldSnapshot = await getEnrolmentBillingStatus(enrolment.id, { asOfDate: baseStart });
    const carriedCredits = oldSnapshot?.remainingCredits ?? enrolment.creditsRemaining ?? enrolment.creditsBalanceCached ?? 0;
    newPaidThroughDate = await computePaidThroughPreview({
      startDate: baseStart,
      endDate: plannedEndDate,
      templates,
      credits: carriedCredits,
      sessionsPerWeek: resolveSessionsPerWeek(enrolment.plan),
    });
  }

  const wouldShorten = wouldShortenCoverage(oldPaidThrough, newPaidThroughDate);

  return {
    ok: true as const,
    data: {
      oldPaidThroughDateKey: oldPaidThrough ? toBrisbaneDayKey(brisbaneStartOfDay(oldPaidThrough)) : null,
      newPaidThroughDateKey: newPaidThroughDate ? toBrisbaneDayKey(brisbaneStartOfDay(newPaidThroughDate)) : null,
      oldTemplates: oldTemplates.map((template) => describeTemplate(template)),
      newTemplates: templates.map((template) => describeTemplate(template)),
      wouldShorten,
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

function resolveSessionsPerWeek(plan: EnrolmentPlan | null | undefined) {
  const count = plan?.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
  return count;
}

async function computeWeeklyChangeoverPaidThrough(params: {
  client: Prisma.TransactionClient | PrismaClient;
  changeoverDate: Date;
  oldPaidThrough: Date;
  oldTemplates: Array<{ id: string; dayOfWeek: number | null; levelId?: string | null }>;
  newTemplates: Array<{ id: string; dayOfWeek: number | null; levelId?: string | null }>;
  plannedEndDate: Date | null;
  sessionsPerWeek: number;
}) {
  if (!params.oldTemplates.length || !params.newTemplates.length) {
    return brisbaneStartOfDay(params.oldPaidThrough);
  }

  const startDate = brisbaneStartOfDay(params.changeoverDate);
  const paidThroughDate = brisbaneStartOfDay(params.oldPaidThrough);
  const startDayKey = toBrisbaneDayKey(startDate);
  const endDayKey = toBrisbaneDayKey(paidThroughDate);

  if (brisbaneCompare(endDayKey, startDayKey) < 0) {
    return paidThroughDate;
  }

  const oldTemplateIds = params.oldTemplates.map((template) => template.id);
  const oldLevelIds = params.oldTemplates.map((template) => template.levelId ?? null);
  const newTemplateIds = params.newTemplates.map((template) => template.id);
  const newLevelIds = params.newTemplates.map((template) => template.levelId ?? null);

  const oldHolidays = await params.client.holiday.findMany({
    where: {
      startDate: { lte: paidThroughDate },
      endDate: { gte: startDate },
      ...buildHolidayScopeWhere({ templateIds: oldTemplateIds, levelIds: oldLevelIds }),
    },
    select: { startDate: true, endDate: true },
  });

  const scheduledSessions = countScheduledSessionsExcludingHolidays({
    startDayKey,
    endDayKey,
    assignedTemplates: params.oldTemplates,
    holidays: oldHolidays,
  });

  if (scheduledSessions <= 0) {
    return paidThroughDate;
  }

  const horizon = resolveOccurrenceHorizon({
    startDate,
    endDate: params.plannedEndDate ?? null,
    occurrencesNeeded: scheduledSessions,
    sessionsPerWeek: params.sessionsPerWeek,
  });

  const newHolidays = await params.client.holiday.findMany({
    where: {
      startDate: { lte: brisbaneStartOfDay(horizon) },
      endDate: { gte: startDate },
      ...buildHolidayScopeWhere({ templateIds: newTemplateIds, levelIds: newLevelIds }),
    },
    select: { startDate: true, endDate: true },
  });

  const enrolmentEndDayKey = params.plannedEndDate ? toBrisbaneDayKey(brisbaneStartOfDay(params.plannedEndDate)) : null;

  const newPaidThroughKey = computeCoverageEndDay({
    startDayKey,
    assignedTemplates: params.newTemplates,
    holidays: newHolidays,
    entitlementSessions: scheduledSessions,
    endDayKey: enrolmentEndDayKey,
  });

  return newPaidThroughKey ? brisbaneStartOfDay(newPaidThroughKey) : paidThroughDate;
}

async function computePaidThroughPreview(params: {
  startDate: Date;
  endDate: Date | null;
  templates: Array<{ id: string; dayOfWeek: number | null; startDate: Date; endDate: Date | null; levelId: string | null }>;
  credits: number;
  sessionsPerWeek: number;
}) {
  if (!params.templates.length) return null;

  const occurrencesNeeded = Math.max(params.credits + params.sessionsPerWeek, 1);
  const horizon = resolveOccurrenceHorizon({
    startDate: params.startDate,
    endDate: params.endDate,
    occurrencesNeeded,
    sessionsPerWeek: params.sessionsPerWeek,
  });

  const templateIds = params.templates.map((template) => template.id);
  const levelIds = params.templates.map((template) => template.levelId ?? null);

  const holidays = await prisma.holiday.findMany({
    where: {
      startDate: { lte: brisbaneStartOfDay(horizon) },
      endDate: { gte: brisbaneStartOfDay(params.startDate) },
      ...buildHolidayScopeWhere({ templateIds, levelIds }),
    },
    select: { startDate: true, endDate: true, levelId: true, templateId: true },
  });

  const templatesById = new Map(
    params.templates.map((template) => [template.id, { id: template.id, levelId: template.levelId ?? null }])
  );

  const missedOccurrencePredicate = buildMissedOccurrencePredicate({
    templatesById,
    holidays,
    cancellationCredits: [],
  });

  const occurrences = buildOccurrenceSchedule({
    startDate: params.startDate,
    endDate: params.endDate,
    templates: params.templates.map((template) => ({
      templateId: template.id,
      dayOfWeek: template.dayOfWeek,
      startDate: template.startDate,
      endDate: template.endDate,
    })),
    cancellations: [],
    occurrencesNeeded,
    sessionsPerWeek: params.sessionsPerWeek,
    horizon,
    shouldSkipOccurrence: ({ templateId, date }) =>
      missedOccurrencePredicate(templateId, toBrisbaneDayKey(date)),
  });

  const walk = consumeOccurrencesForCredits({ occurrences, credits: params.credits });
  return walk.paidThrough ? brisbaneStartOfDay(walk.paidThrough) : null;
}
