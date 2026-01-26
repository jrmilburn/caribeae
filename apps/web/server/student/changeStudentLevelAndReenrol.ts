"use server";

import { revalidatePath } from "next/cache";
import { addDays, differenceInCalendarDays, isAfter, isBefore, startOfDay } from "date-fns";
import {
  BillingType,
  EnrolmentStatus,
  InvoiceLineItemKind,
  InvoiceStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  getSelectionRequirement,
  initialAccountingForPlan,
  normalizeStartDate,
  resolvePlannedEndDate,
} from "@/server/enrolment/planRules";
import { validateSelection } from "@/server/enrolment/validateSelection";
import { assertPlanMatchesTemplates } from "@/server/enrolment/planCompatibility";
import { createInitialInvoiceForEnrolment } from "@/server/invoicing";
import { getEnrolmentBillingStatus, recomputeEnrolmentComputedFields } from "@/server/billing/enrolmentBilling";
import { recalculateEnrolmentCoverage } from "@/server/billing/recalculateEnrolmentCoverage";
import { createInvoiceWithLineItems, createPaymentAndAllocate } from "@/server/billing/invoiceMutations";
import { computeBlockCoverageRange, listScheduledOccurrences } from "@/server/billing/paidThroughDate";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { getCapacityIssueForTemplateRange } from "@/server/class/capacity";
import type { CapacityExceededDetails } from "@/lib/capacityError";
import { dayKeyToDate, nextScheduledDayKey } from "@/server/billing/coverageEngine";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

type ChangeStudentLevelInput = {
  studentId: string;
  toLevelId: string;
  effectiveDate: string;
  templateIds: string[];
  planId: string;
  note?: string | null;
  allowOverload?: boolean;
};

type EnrolmentWithRelations = Prisma.EnrolmentGetPayload<{
  include: { plan: true; template: true; classAssignments: { include: { template: true } } };
}>;

type CreditResult = {
  creditCents: number;
  creditUnits: number;
};

type TemplateWithScope = {
  id: string;
  dayOfWeek: number | null;
  levelId?: string | null;
};

function resolveAssignedTemplates(enrolment: EnrolmentWithRelations): TemplateWithScope[] {
  if (enrolment.classAssignments.length) {
    return enrolment.classAssignments
      .map((assignment) => assignment.template)
      .filter((template): template is NonNullable<typeof template> => Boolean(template))
      .map((template) => ({
        id: template.id,
        dayOfWeek: template.dayOfWeek ?? null,
        levelId: template.levelId ?? null,
      }));
  }
  return enrolment.template
    ? [{
        id: enrolment.template.id,
        dayOfWeek: enrolment.template.dayOfWeek ?? null,
        levelId: enrolment.template.levelId ?? null,
      }]
    : [];
}

function filterHolidaysForTemplate(
  holidays: Array<{ startDate: Date; endDate: Date; levelId?: string | null; templateId?: string | null }>,
  template: TemplateWithScope
) {
  return holidays.filter((holiday) => {
    if (holiday.templateId && holiday.templateId !== template.id) return false;
    if (holiday.levelId && holiday.levelId !== template.levelId) return false;
    return true;
  });
}

function getPlanUnitPriceCents(plan: { billingType: BillingType; priceCents: number; sessionsPerWeek: number | null; blockClassCount: number | null }) {
  if (plan.billingType === BillingType.PER_WEEK) {
    const sessionsPerWeek = plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
    return plan.priceCents / sessionsPerWeek;
  }
  const blockClassCount = plan.blockClassCount && plan.blockClassCount > 0 ? plan.blockClassCount : 1;
  return plan.priceCents / blockClassCount;
}

async function computeWeeklyCredit(params: {
  enrolment: EnrolmentWithRelations;
  endDate: Date;
  paidThroughDate?: Date | null;
  client: Prisma.TransactionClient;
}): Promise<CreditResult> {
  if (!params.enrolment.plan) return { creditCents: 0, creditUnits: 0 };
  const paidThroughDate = params.paidThroughDate ? startOfDay(params.paidThroughDate) : null;
  const endDate = startOfDay(params.endDate);
  if (!paidThroughDate || !isAfter(paidThroughDate, endDate)) {
    return { creditCents: 0, creditUnits: 0 };
  }
  const unusedStart = addDays(endDate, 1);
  if (isAfter(unusedStart, paidThroughDate)) {
    return { creditCents: 0, creditUnits: 0 };
  }

  const templates = resolveAssignedTemplates(params.enrolment);
  if (!templates.length) return { creditCents: 0, creditUnits: 0 };

  const templateIds = templates.map((template) => template.id);
  const levelIds = templates.map((template) => template.levelId ?? null);

  const [holidays, cancellations] = await Promise.all([
    params.client.holiday.findMany({
      where: {
        startDate: { lte: paidThroughDate },
        endDate: { gte: unusedStart },
        ...buildHolidayScopeWhere({ templateIds, levelIds }),
      },
      select: { startDate: true, endDate: true, levelId: true, templateId: true },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    }),
    params.client.classCancellation.findMany({
      where: {
        templateId: { in: templateIds },
        date: { gte: unusedStart, lte: paidThroughDate },
      },
      select: { templateId: true, date: true },
    }),
  ]);

  let totalOccurrences = 0;
  for (const template of templates) {
    const templateHolidays = filterHolidaysForTemplate(holidays, template);
    const templateCancellations = cancellations
      .filter((cancellation) => cancellation.templateId === template.id)
      .map((cancellation) => cancellation.date);
    const occurrences = listScheduledOccurrences({
      startDate: unusedStart,
      endDate: paidThroughDate,
      classTemplate: { dayOfWeek: template.dayOfWeek },
      holidays: templateHolidays,
      cancellations: templateCancellations,
    });
    totalOccurrences += occurrences.length;
  }

  if (totalOccurrences <= 0) return { creditCents: 0, creditUnits: 0 };
  const sessionsPerWeek = params.enrolment.plan.sessionsPerWeek && params.enrolment.plan.sessionsPerWeek > 0
    ? params.enrolment.plan.sessionsPerWeek
    : 1;
  const perSession = params.enrolment.plan.priceCents / sessionsPerWeek;
  return {
    creditCents: Math.round(perSession * totalOccurrences),
    creditUnits: totalOccurrences,
  };
}

async function computeCreditForEnrolment(params: {
  enrolment: EnrolmentWithRelations;
  snapshot: Awaited<ReturnType<typeof getEnrolmentBillingStatus>>;
  endDate: Date;
  client: Prisma.TransactionClient;
}): Promise<CreditResult> {
  if (!params.enrolment.plan) return { creditCents: 0, creditUnits: 0 };
  if (params.enrolment.plan.billingType === BillingType.PER_WEEK) {
    return computeWeeklyCredit({
      enrolment: params.enrolment,
      endDate: params.endDate,
      paidThroughDate: params.snapshot.paidThroughDate ?? params.enrolment.paidThroughDate,
      client: params.client,
    });
  }

  const remainingCredits = params.snapshot.remainingCredits ?? params.enrolment.creditsRemaining ?? 0;
  if (!remainingCredits || remainingCredits <= 0) return { creditCents: 0, creditUnits: 0 };
  const blockSize = params.enrolment.plan.blockClassCount && params.enrolment.plan.blockClassCount > 0
    ? params.enrolment.plan.blockClassCount
    : 1;
  const perCredit = params.enrolment.plan.priceCents / blockSize;
  return {
    creditCents: Math.round(remainingCredits * perCredit),
    creditUnits: remainingCredits,
  };
}

type ChangeStudentLevelResult =
  | {
      ok: true;
      data: {
        levelChangeId: string;
        enrolmentIds: string[];
        creditInvoiceId: string | null;
        paymentId: string | null;
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
    const alignedEndDates = new Map<string, Date>();
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
      alignedEndDates.set(enrolment.id, alignedEnd);
      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: {
          endDate: alignedEnd,
          status: EnrolmentStatus.CHANGEOVER,
          cancelledAt: null,
        },
      });
    }

    let totalCreditCents = 0;
    for (const enrolment of existingEnrolments) {
      const alignedEnd = alignedEndDates.get(enrolment.id) ?? endBoundary;
      const snapshot = await getEnrolmentBillingStatus(enrolment.id, { client: tx, asOfDate: alignedEnd });
      const credit = await computeCreditForEnrolment({
        enrolment,
        snapshot,
        endDate: alignedEnd,
        client: tx,
      });
      totalCreditCents += credit.creditCents;
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
    const accounting = initialAccountingForPlan(plan, earliestStart);
    const prorationSource = existingEnrolments
      .filter((enrolment) => enrolment.plan && (enrolment.paidThroughDate || enrolment.paidThroughDateComputed))
      .sort((a, b) => {
        const dateA = a.paidThroughDate ?? a.paidThroughDateComputed ?? a.startDate;
        const dateB = b.paidThroughDate ?? b.paidThroughDateComputed ?? b.startDate;
        return dateB.getTime() - dateA.getTime();
      })[0];

    const basePaidThroughDate = prorationSource?.paidThroughDate ?? prorationSource?.paidThroughDateComputed ?? null;
    const oldPlan = prorationSource?.plan ?? null;
    const newPlanUnitPriceCentsRaw = getPlanUnitPriceCents(plan);
    const oldPlanUnitPriceCentsRaw = oldPlan ? getPlanUnitPriceCents(oldPlan) : 0;
    const basePaidThroughDateStart = basePaidThroughDate ? startOfDay(basePaidThroughDate) : null;
    const prorationStartDate = startOfDay(earliestStart);
    const proratedPaidThroughDate =
      basePaidThroughDateStart && oldPlanUnitPriceCentsRaw > 0 && newPlanUnitPriceCentsRaw > 0
        ? (() => {
            const durationDays = Math.max(
              0,
              differenceInCalendarDays(basePaidThroughDateStart, prorationStartDate)
            );
            const ratio = oldPlanUnitPriceCentsRaw / newPlanUnitPriceCentsRaw;
            const proratedDate = addDays(prorationStartDate, durationDays * ratio);
            if (plan.billingType === BillingType.PER_CLASS) {
              const nextScheduledDay = nextScheduledDayKey({
                startDayKey: toBrisbaneDayKey(startOfDay(proratedDate)),
                assignedTemplates: templates.map((template) => ({ dayOfWeek: template.dayOfWeek })),
              });
              return dayKeyToDate(nextScheduledDay);
            }
            return proratedDate;
          })()
        : null;
    const paidThroughDate = proratedPaidThroughDate ?? accounting.paidThroughDate ?? null;

    const enrolment = await tx.enrolment.create({
      data: {
        templateId: anchorTemplate?.id ?? templates[0]?.id ?? "",
        studentId: input.studentId,
        startDate: earliestStart,
        endDate,
        status: EnrolmentStatus.ACTIVE,
        planId: plan.id,
        paidThroughDate,
        creditsRemaining: accounting.creditsRemaining,
        creditsBalanceCached: accounting.creditsRemaining ?? null,
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

    await createInitialInvoiceForEnrolment(enrolment.id, { prismaClient: tx, skipAuth: true });
    if (enrolment.plan?.billingType === BillingType.PER_WEEK) {
      await recalculateEnrolmentCoverage(enrolment.id, "PLAN_CHANGED", { tx, actorId: user.id });
    } else {
      await recomputeEnrolmentComputedFields(enrolment.id, { client: tx });
    }

    const enrolments: EnrolmentWithRelations[] = [enrolment];

    const newPlanUnitPriceCents = Math.round(newPlanUnitPriceCentsRaw);
    let remainingCreditCents = totalCreditCents;
    if (totalCreditCents > 0 && newPlanUnitPriceCents > 0) {
      const unitsToApply = Math.floor(totalCreditCents / newPlanUnitPriceCents);
      if (unitsToApply > 0) {
        if (plan.billingType === BillingType.PER_CLASS) {
          await tx.enrolmentCreditEvent.create({
            data: {
              enrolmentId: enrolment.id,
              type: "MANUAL_ADJUST",
              creditsDelta: unitsToApply,
              occurredOn: startOfDay(effectiveDate),
              note: "Level change credit",
            },
          });
          await recomputeEnrolmentComputedFields(enrolment.id, { client: tx });
        } else {
          const templateIdsForPlan = templates.map((template) => template.id);
          const levelIdsForPlan = templates.map((template) => template.levelId ?? null);
          const horizonWeeks = Math.max(
            1,
            Math.ceil(unitsToApply / (plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1)) + 4
          );
          const horizonEnd = enrolment.endDate
            ? startOfDay(enrolment.endDate)
            : addDays(startOfDay(enrolment.startDate), horizonWeeks * 7);
          const holidays = await tx.holiday.findMany({
            where: {
              startDate: { lte: horizonEnd },
              endDate: { gte: startOfDay(enrolment.startDate) },
              ...buildHolidayScopeWhere({ templateIds: templateIdsForPlan, levelIds: levelIdsForPlan }),
            },
            select: { startDate: true, endDate: true },
          });
          const coverage = computeBlockCoverageRange({
            currentPaidThroughDate: enrolment.paidThroughDate,
            enrolmentStartDate: enrolment.startDate,
            enrolmentEndDate: enrolment.endDate ?? null,
            classTemplate: {
              dayOfWeek: anchorTemplate?.dayOfWeek ?? templates[0]?.dayOfWeek ?? null,
            },
            assignedTemplates: templates.map((template) => ({ dayOfWeek: template.dayOfWeek ?? null })),
            blockClassCount: 1,
            creditsPurchased: unitsToApply,
            holidays,
          });
          if (coverage.coverageEnd) {
            await tx.enrolment.update({
              where: { id: enrolment.id },
              data: {
                paidThroughDate: coverage.coverageEnd,
                paidThroughDateComputed: coverage.coverageEnd,
              },
            });
            await recomputeEnrolmentComputedFields(enrolment.id, { client: tx });
          }
        }
        remainingCreditCents -= unitsToApply * newPlanUnitPriceCents;
      }
    }

    const newInvoices = enrolments.length
      ? await tx.invoice.findMany({
          where: { enrolmentId: { in: enrolments.map((e) => e.id) } },
          select: {
            id: true,
            amountCents: true,
            amountPaidCents: true,
            status: true,
          },
        })
      : [];

    const creditToBalanceCents = Math.max(
      remainingCreditCents,
      0
    );

    const creditInvoice =
      creditToBalanceCents > 0
        ? await createInvoiceWithLineItems({
            familyId: student.familyId,
            lineItems: [
              {
                kind: InvoiceLineItemKind.ADJUSTMENT,
                description: "Level change credit",
                quantity: 1,
                amountCents: -creditToBalanceCents,
              },
            ],
            status: InvoiceStatus.PAID,
            issuedAt: new Date(),
            dueAt: new Date(),
            client: tx,
            skipAuth: true,
          })
        : null;

    const outstandingTargets = newInvoices
      .map((inv) => ({
        invoiceId: inv.id,
        remaining: Math.max(inv.amountCents - inv.amountPaidCents, 0),
      }))
      .filter((inv) => inv.remaining > 0);

    const creditAllocations: { invoiceId: string; amountCents: number }[] = [];
    if (creditToBalanceCents > 0 && outstandingTargets.length) {
      let remainingCredit = creditToBalanceCents;
      for (const target of outstandingTargets) {
        if (remainingCredit <= 0) break;
        const applied = Math.min(target.remaining, remainingCredit);
        creditAllocations.push({ invoiceId: target.invoiceId, amountCents: applied });
        remainingCredit -= applied;
      }
    }

    const payment =
      creditToBalanceCents > 0
        ? await createPaymentAndAllocate({
            familyId: student.familyId,
            amountCents: creditToBalanceCents,
            method: "credit",
            note: "Level change credit",
            allocations: creditAllocations.length ? creditAllocations : undefined,
            client: tx,
            skipAuth: true,
          })
        : null;

    return {
      data: {
        levelChangeId: levelChange.id,
        enrolmentIds: enrolments.map((e) => e.id),
        creditInvoiceId: creditInvoice?.id ?? null,
        paymentId: payment?.payment.id ?? null,
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
