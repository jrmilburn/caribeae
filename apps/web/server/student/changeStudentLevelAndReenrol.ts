"use server";

import { revalidatePath } from "next/cache";
import { addDays, isAfter, isBefore, startOfDay } from "date-fns";
import { BillingType, EnrolmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getSelectionRequirement, normalizeStartDate, resolvePlannedEndDate } from "@/server/enrolment/planRules";
import { validateSelection } from "@/server/enrolment/validateSelection";
import { assertPlanMatchesTemplates } from "@/server/enrolment/planCompatibility";
import { adjustCreditsForManualPaidThroughDate } from "@/server/billing/enrolmentBilling";
import { getCapacityIssueForTemplateRange } from "@/server/class/capacity";
import type { CapacityExceededDetails } from "@/lib/capacityError";
import {
  applyClassChangeSettlement,
  buildClassChangeSettlementKey,
  computeClassChangeSettlementForRange,
  resolveChangeOverPaidThroughDate,
  type ClassChangeSettlementSummary,
} from "@/server/billing/classChangeSettlement";

type ChangeStudentLevelInput = {
  studentId: string;
  toLevelId: string;
  effectiveDate: string;
  templateIds: string[];
  planId: string;
  note?: string | null;
  allowOverload?: boolean;
};

type ChangeStudentLevelResult =
  | {
      ok: true;
      data: {
        levelChangeId: string;
        enrolmentIds: string[];
        settlement: ClassChangeSettlementSummary;
        settlementInvoiceId: string | null;
        settlementPaymentId: string | null;
        familyId: string;
      };
    }
  | {
      ok: false;
      error:
        | {
            code: "CAPACITY_EXCEEDED";
            details: CapacityExceededDetails;
          }
        | {
            code: "VALIDATION_ERROR" | "UNKNOWN_ERROR";
            message: string;
          };
    };

export async function changeStudentLevelAndReenrol(
  input: ChangeStudentLevelInput
): Promise<ChangeStudentLevelResult> {
  const user = await getOrCreateUser();
  await requireAdmin();

  if (!input.templateIds.length) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Select at least one class template." },
    };
  }

  const templateIds = Array.from(new Set(input.templateIds));
  const effectiveDate = normalizeStartDate(input.effectiveDate);

  try {
    const result = await prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      select: { id: true, levelId: true, familyId: true },
    });
    if (!student) {
      throw new Error("Student not found.");
    }

    const plan = await tx.enrolmentPlan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      throw new Error("Enrolment plan not found.");
    }
    if (plan.levelId !== input.toLevelId) {
      throw new Error("Plan level must match the new student level.");
    }

    const templates = await tx.classTemplate.findMany({
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
    if (templates.length !== templateIds.length) {
      throw new Error("Some selected classes could not be found.");
    }

    if (templates.some((t) => t.levelId !== input.toLevelId)) {
      throw new Error("Selected classes must belong to the new level.");
    }

    const invalidDate = templates.find((t) => {
      const start = startOfDay(t.startDate);
      const end = t.endDate ? startOfDay(t.endDate) : null;
      if (isAfter(start, effectiveDate)) return true;
      if (end && isBefore(end, effectiveDate)) return true;
      return false;
    });
    if (invalidDate) {
      throw new Error("Each selected class must run on or after the effective date.");
    }

    const selection = validateSelection({ plan, templateIds, templates });
    if (!selection.ok) {
      throw new Error(selection.message ?? "Invalid class selection for the plan.");
    }
    if (templateIds.length < 1) {
      throw new Error("Select at least one class template.");
    }

    assertPlanMatchesTemplates(plan, templates);

    const selectionRequirement = getSelectionRequirement(plan);
    if (selectionRequirement.requiredCount > 0 && templateIds.length !== selectionRequirement.requiredCount) {
      throw new Error(`Select ${selectionRequirement.requiredCount} classes for this plan.`);
    }
    if (selectionRequirement.requiredCount === 0 && templateIds.length > selectionRequirement.maxCount) {
      throw new Error(`Select up to ${selectionRequirement.maxCount} classes for this plan.`);
    }

    const windows = templates.map((template) => {
      const templateStart = startOfDay(template.startDate);
      const templateEnd = template.endDate ? startOfDay(template.endDate) : null;
      const startDate = isBefore(effectiveDate, templateStart) ? templateStart : effectiveDate;
      if (templateEnd && isAfter(startDate, templateEnd)) {
        throw new Error(`Start date is after the class ends for ${template.name ?? "class"}.`);
      }
      return { templateId: template.id, startDate, endDate: templateEnd };
    });

    let capacityIssue: CapacityExceededDetails | null = null;
    for (const window of windows) {
      const template = templates.find((item) => item.id === window.templateId);
      if (!template) continue;
      const issue = await getCapacityIssueForTemplateRange({
        template: {
          ...template,
          startTime: template.startTime ?? null,
          capacity: template.capacity ?? null,
        },
        plan,
        windowStart: window.startDate,
        windowEnd: window.endDate ?? null,
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
      console.info("[capacity] overload confirmed for changeStudentLevelAndReenrol", {
        templateId: capacityIssue.templateId,
        occurrenceDateKey: capacityIssue.occurrenceDateKey,
        capacity: capacityIssue.capacity,
        currentCount: capacityIssue.currentCount,
        projectedCount: capacityIssue.projectedCount,
      });
    }

    const existingEnrolments = await tx.enrolment.findMany({
      where: {
        studentId: input.studentId,
        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED, EnrolmentStatus.CHANGEOVER] },
      },
      include: { plan: true, template: true, classAssignments: { include: { template: true } } },
    });

    const endBoundary = addDays(effectiveDate, -1);
    for (const enrolment of existingEnrolments) {
      const enrolmentStart = startOfDay(enrolment.startDate);
      const enrolmentEnd = enrolment.endDate ? startOfDay(enrolment.endDate) : null;
      let alignedEnd = endBoundary;
      if (enrolmentEnd && isBefore(enrolmentEnd, alignedEnd)) {
        alignedEnd = enrolmentEnd;
      }
      if (isBefore(alignedEnd, enrolmentStart)) {
        alignedEnd = enrolmentStart;
      }
      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: {
          endDate: alignedEnd,
          status: EnrolmentStatus.CHANGEOVER,
          cancelledAt: null,
        },
      });
    }

    const levelChange = await tx.studentLevelChange.create({
      data: {
        studentId: input.studentId,
        fromLevelId: student.levelId,
        toLevelId: input.toLevelId,
        effectiveDate,
        note: input.note?.trim() || null,
        createdById: user?.id ?? null,
      },
    });

    await tx.student.update({
      where: { id: input.studentId },
      data: { levelId: input.toLevelId },
    });

    const anchorTemplate = templates.sort((a, b) => {
      const dayA = a.dayOfWeek ?? 7;
      const dayB = b.dayOfWeek ?? 7;
      if (dayA !== dayB) return dayA - dayB;
      return a.id.localeCompare(b.id);
    })[0];

    const earliestStart = windows.reduce(
      (acc, window) => (acc && acc < window.startDate ? acc : window.startDate),
      windows[0]?.startDate ?? effectiveDate
    );
    const templateEndDates = windows.map((window) => window.endDate).filter(Boolean) as Date[];
    const earliestEnd = templateEndDates.length
      ? templateEndDates.reduce((acc, end) => (acc && acc < end ? acc : end))
      : null;
    const endDate = resolvePlannedEndDate(plan, earliestStart, null, earliestEnd);
    const prorationSource = existingEnrolments
      .filter((enrolment) => enrolment.plan && (enrolment.paidThroughDate || enrolment.paidThroughDateComputed))
      .sort((a, b) => {
        const dateA = a.paidThroughDate ?? a.paidThroughDateComputed ?? a.startDate;
        const dateB = b.paidThroughDate ?? b.paidThroughDateComputed ?? b.startDate;
        return dateB.getTime() - dateA.getTime();
      })[0];

    const paidThroughDate = resolveChangeOverPaidThroughDate(
      prorationSource?.paidThroughDate ?? prorationSource?.paidThroughDateComputed ?? null
    );

    const enrolment = await tx.enrolment.create({
      data: {
        templateId: anchorTemplate?.id ?? templates[0]?.id ?? "",
        studentId: input.studentId,
        startDate: earliestStart,
        endDate,
        status: EnrolmentStatus.ACTIVE,
        planId: plan.id,
        paidThroughDate,
        creditsRemaining: plan.billingType === BillingType.PER_CLASS ? 0 : null,
        creditsBalanceCached: plan.billingType === BillingType.PER_CLASS ? 0 : null,
        paidThroughDateComputed: paidThroughDate,
      },
      include: { plan: true, template: true, classAssignments: { include: { template: true } } },
    });

    await tx.enrolment.update({
      where: { id: enrolment.id },
      data: { billingGroupId: enrolment.id },
    });

    await tx.enrolmentClassAssignment.createMany({
      data: templateIds.map((templateId) => ({ enrolmentId: enrolment.id, templateId })),
      skipDuplicates: true,
    });

    if (plan.billingType === BillingType.PER_CLASS) {
      await adjustCreditsForManualPaidThroughDate(tx, enrolment, paidThroughDate);
    }

    const settlement = await computeClassChangeSettlementForRange({
      client: tx,
      oldPlan: prorationSource?.plan ?? plan,
      newPlan: plan,
      changeOverDate: earliestStart,
      paidThroughDate,
      templates: templates.map((template) => ({
        id: template.id,
        dayOfWeek: template.dayOfWeek ?? null,
        levelId: template.levelId ?? null,
      })),
    });

    let settlementInvoiceId: string | null = null;
    let settlementPaymentId: string | null = null;

    if (settlement.differenceCents !== 0) {
      if (!student.familyId) {
        throw new Error("Family not found for settlement.");
      }
      const settlementKey = buildClassChangeSettlementKey({
        enrolmentId: prorationSource?.id ?? enrolment.id,
        newPlanId: plan.id,
        changeOverDate: earliestStart,
        paidThroughDate,
        templateIds,
      });
      const settlementResult = await applyClassChangeSettlement({
        client: tx,
        familyId: student.familyId,
        enrolmentId: enrolment.id,
        settlement,
        settlementKey,
        planId: plan.id,
      });
      settlementInvoiceId = settlementResult.invoiceId;
      settlementPaymentId = settlementResult.paymentId;
    }

    return {
      data: {
        levelChangeId: levelChange.id,
        enrolmentIds: [enrolment.id],
        settlement,
        settlementInvoiceId,
        settlementPaymentId,
        familyId: student.familyId,
      },
    };
  });

    if ("capacityIssue" in result && result.capacityIssue) {
      console.info("[capacity] exceeded for changeStudentLevelAndReenrol", {
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

    revalidatePath(`/admin/family/${result.data.familyId}`);
    revalidatePath(`/admin/student/${input.studentId}`);
    revalidatePath("/admin/enrolment");
    templateIds.forEach((id) => revalidatePath(`/admin/class/${id}`));

    return { ok: true, data: result.data };
  } catch (error) {
    if (error instanceof Error) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message || "Unable to change student level.",
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Unable to change student level.",
      },
    };
  }
}
