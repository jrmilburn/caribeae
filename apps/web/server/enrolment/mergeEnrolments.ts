"use server";

import { addDays, isAfter, isBefore, startOfDay } from "date-fns";
import { EnrolmentCreditEventType, EnrolmentStatus } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizePlan, normalizeStartDate, resolvePlannedEndDate, getSelectionRequirement } from "@/server/enrolment/planRules";
import { assertPlanMatchesTemplates } from "@/server/enrolment/planCompatibility";
import { recalculateEnrolmentCoverage } from "@/server/billing/recalculateEnrolmentCoverage";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";
import {
  brisbaneCompare,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { resolveOccurrenceHorizon } from "@/server/billing/occurrenceWalker";
import { computeCoverageEndDay, countScheduledSessionsExcludingHolidays } from "@/server/billing/coverageEngine";

const mergeSchema = z.object({
  enrolmentIds: z.array(z.string().min(1)).min(2),
  planId: z.string().min(1),
  startDate: z.string().optional(),
});

type MergeEnrolmentsResult =
  | {
      ok: true;
      data: {
        enrolmentId: string;
        studentId: string;
        familyId: string | null;
        templateIds: string[];
      };
    }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR" | "UNKNOWN_ERROR";
        message: string;
      };
    };

type TemplateSummary = {
  id: string;
  levelId: string | null;
  dayOfWeek: number | null;
  startDate: Date;
  endDate: Date | null;
  startTime: number | null;
  name: string | null;
};

function resolveAnchorTemplate(templates: TemplateSummary[]) {
  if (!templates.length) return null;
  const sorted = [...templates].sort((a, b) => {
    const dayA = a.dayOfWeek ?? 7;
    const dayB = b.dayOfWeek ?? 7;
    if (dayA !== dayB) return dayA - dayB;
    const timeA = a.startTime ?? 0;
    const timeB = b.startTime ?? 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}

export async function mergeEnrolments(input: z.input<typeof mergeSchema>): Promise<MergeEnrolmentsResult> {
  try {
    const user = await getOrCreateUser();
    await requireAdmin();

    const payload = mergeSchema.parse(input);
    const startDate = normalizeStartDate(payload.startDate ?? new Date());

    const result = await prisma.$transaction(async (tx) => {
      const enrolments = await tx.enrolment.findMany({
        where: { id: { in: payload.enrolmentIds } },
        include: {
          plan: true,
          student: { select: { id: true, familyId: true } },
          template: true,
          classAssignments: {
            include: { template: true },
          },
        },
      });

      if (enrolments.length !== payload.enrolmentIds.length) {
        throw new Error("Some enrolments could not be found.");
      }

      const studentId = enrolments[0]?.studentId ?? null;
      if (!studentId || enrolments.some((enrolment) => enrolment.studentId !== studentId)) {
        throw new Error("Enrolments must belong to the same student.");
      }

      const plan = await tx.enrolmentPlan.findUnique({ where: { id: payload.planId } });
      if (!plan) {
        throw new Error("Target enrolment plan not found.");
      }

      const inactive = enrolments.find((enrolment) => enrolment.status !== EnrolmentStatus.ACTIVE);
      if (inactive) {
        throw new Error("Only active enrolments can be merged.");
      }

      const billingTypeMismatch = enrolments.find(
        (enrolment) => enrolment.plan?.billingType && enrolment.plan.billingType !== plan.billingType
      );
      if (billingTypeMismatch) {
        throw new Error("Target plan billing type must match the selected enrolments.");
      }

      const templatesMap = new Map<string, TemplateSummary>();
      enrolments.forEach((enrolment) => {
        const templates = enrolment.classAssignments.length
          ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
          : enrolment.template
            ? [enrolment.template]
            : [];
        if (!templates.length) {
          throw new Error("All enrolments must have assigned classes before merging.");
        }
        templates.forEach((template) => {
          templatesMap.set(template.id, {
            id: template.id,
            levelId: template.levelId ?? null,
            dayOfWeek: template.dayOfWeek ?? null,
            startDate: template.startDate,
            endDate: template.endDate,
            startTime: template.startTime ?? null,
            name: template.name ?? null,
          });
        });
      });

      const templates = Array.from(templatesMap.values());
      if (!templates.length) {
        throw new Error("Select enrolments with class assignments to merge.");
      }

      const levelId = templates[0]?.levelId ?? null;
      if (!levelId || templates.some((template) => template.levelId !== levelId)) {
        throw new Error("Merged enrolments must be within the same level.");
      }
      if (plan.levelId !== levelId) {
        throw new Error("Target plan level must match the enrolment level.");
      }

      assertPlanMatchesTemplates(plan, templates);

      const normalizedPlan = normalizePlan(plan);
      const totalClasses = templates.length;
      if (plan.billingType === "PER_WEEK") {
        if (totalClasses !== normalizedPlan.sessionsPerWeek) {
          throw new Error("Merged enrolment must match the plan sessions per week.");
        }
      } else {
        const requirement = getSelectionRequirement(plan);
        if (requirement.requiredCount > 0 && totalClasses !== requirement.requiredCount) {
          throw new Error(`Merged enrolment must include ${requirement.requiredCount} classes.`);
        }
        if (requirement.requiredCount === 0 && totalClasses > requirement.maxCount) {
          throw new Error(`Merged enrolment can include up to ${requirement.maxCount} classes.`);
        }
      }

      const windows = templates.map((template) => {
        const templateStart = startOfDay(template.startDate);
        const templateEnd = template.endDate ? startOfDay(template.endDate) : null;
        const alignedStart = isBefore(startDate, templateStart) ? templateStart : startDate;
        if (templateEnd && isAfter(alignedStart, templateEnd)) {
          throw new Error("Merge start date is after a class template ends.");
        }
        return { templateId: template.id, startDate: alignedStart, endDate: templateEnd };
      });
      const templateEndDates = windows.map((window) => window.endDate).filter(Boolean) as Date[];
      const earliestEnd = templateEndDates.length
        ? templateEndDates.reduce((acc, end) => (acc && acc < end ? acc : end))
        : null;
      const plannedEndDate = resolvePlannedEndDate(plan, startDate, null, earliestEnd);

      let paidThroughDate: Date | null = null;
      if (plan.billingType === "PER_WEEK") {
        const startDayKey = toBrisbaneDayKey(brisbaneStartOfDay(startDate));
        let totalSessions = 0;

        for (const enrolment of enrolments) {
          const oldPaidThrough = enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed;
          if (!oldPaidThrough) continue;
          const oldPaidThroughDate = brisbaneStartOfDay(oldPaidThrough);
          const endDayKey = toBrisbaneDayKey(oldPaidThroughDate);
          if (brisbaneCompare(endDayKey, startDayKey) < 0) {
            continue;
          }

          const assignedTemplates = enrolment.classAssignments.length
            ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
            : enrolment.template
              ? [enrolment.template]
              : [];
          if (!assignedTemplates.length) continue;

          const templateIds = assignedTemplates.map((template) => template.id);
          const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
          const holidays = await tx.holiday.findMany({
            where: {
              startDate: { lte: oldPaidThroughDate },
              endDate: { gte: brisbaneStartOfDay(startDate) },
              ...buildHolidayScopeWhere({ templateIds, levelIds }),
            },
            select: { startDate: true, endDate: true },
          });

          const scheduledSessions = countScheduledSessionsExcludingHolidays({
            startDayKey,
            endDayKey,
            assignedTemplates,
            holidays,
          });
          totalSessions += scheduledSessions;
        }

        if (totalSessions > 0) {
          const horizon = resolveOccurrenceHorizon({
            startDate,
            endDate: plannedEndDate,
            occurrencesNeeded: totalSessions,
            sessionsPerWeek: normalizedPlan.sessionsPerWeek,
          });
          const templateIds = templates.map((template) => template.id);
          const levelIds = templates.map((template) => template.levelId ?? null);
          const holidays = await tx.holiday.findMany({
            where: {
              startDate: { lte: brisbaneStartOfDay(horizon) },
              endDate: { gte: brisbaneStartOfDay(startDate) },
              ...buildHolidayScopeWhere({ templateIds, levelIds }),
            },
            select: { startDate: true, endDate: true },
          });

          const enrolmentEndDayKey = plannedEndDate ? toBrisbaneDayKey(brisbaneStartOfDay(plannedEndDate)) : null;
          const newPaidThroughKey = computeCoverageEndDay({
            startDayKey,
            assignedTemplates: templates,
            holidays,
            entitlementSessions: totalSessions,
            endDayKey: enrolmentEndDayKey,
          });
          paidThroughDate = newPaidThroughKey ? brisbaneStartOfDay(newPaidThroughKey) : null;
        }
      }

      const creditSnapshots =
        plan.billingType === "PER_CLASS"
          ? await Promise.all(
              enrolments.map((enrolment) => getEnrolmentBillingStatus(enrolment.id, { client: tx, asOfDate: startDate }))
            )
          : [];
      const totalCredits = creditSnapshots.reduce((sum, snapshot) => sum + (snapshot?.remainingCredits ?? 0), 0);

      const anchorTemplate = resolveAnchorTemplate(templates);
      if (!anchorTemplate) {
        throw new Error("Merged enrolments require at least one class.");
      }

      const newEnrolment = await tx.enrolment.create({
        data: {
          templateId: anchorTemplate.id,
          studentId,
          startDate,
          endDate: plannedEndDate,
          status: EnrolmentStatus.ACTIVE,
          planId: plan.id,
          billingGroupId: enrolments[0]?.billingGroupId ?? enrolments[0]?.id ?? null,
          paidThroughDate,
          paidThroughDateComputed: paidThroughDate,
          creditsRemaining: plan.billingType === "PER_CLASS" ? 0 : null,
          creditsBalanceCached: plan.billingType === "PER_CLASS" ? 0 : null,
        },
      });

      await tx.enrolmentClassAssignment.createMany({
        data: templates.map((template) => ({
          enrolmentId: newEnrolment.id,
          templateId: template.id,
        })),
        skipDuplicates: true,
      });

      if (plan.billingType === "PER_CLASS" && totalCredits !== 0) {
        await tx.enrolmentCreditEvent.create({
          data: {
            enrolmentId: newEnrolment.id,
            type: EnrolmentCreditEventType.MANUAL_ADJUST,
            creditsDelta: totalCredits,
            occurredOn: startDate,
            note: "Merge enrolments credit transfer",
          },
        });
      }

      for (const enrolment of enrolments) {
        const endBoundary = addDays(startDate, -1);
        const enrolmentStart = startOfDay(enrolment.startDate);
        const effectiveEnd = isBefore(endBoundary, enrolmentStart) ? enrolmentStart : endBoundary;
        await tx.enrolment.update({
          where: { id: enrolment.id },
          data: {
            endDate: effectiveEnd,
            status: EnrolmentStatus.CHANGEOVER,
            cancelledAt: null,
          },
        });
      }

      await recalculateEnrolmentCoverage(newEnrolment.id, "PLAN_CHANGED", {
        tx,
        actorId: user.id,
        confirmShorten: true,
      });

      return {
        enrolmentId: newEnrolment.id,
        studentId,
        familyId: enrolments[0]?.student?.familyId ?? null,
        templateIds: templates.map((template) => template.id),
      };
    });

    revalidatePath(`/admin/student/${result.studentId}`);
    result.templateIds.forEach((id) => revalidatePath(`/admin/class/${id}`));
    if (result.familyId) {
      revalidatePath(`/admin/family/${result.familyId}`);
    }
    revalidatePath("/admin/enrolment");

    return {
      ok: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof Error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message || "Unable to merge enrolments.",
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Unable to merge enrolments.",
      },
    };
  }
}
