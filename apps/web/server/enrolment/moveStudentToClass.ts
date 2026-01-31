"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, isAfter, isBefore, startOfDay } from "date-fns";
import { BillingType, EnrolmentStatus, InvoiceLineItemKind, InvoiceStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeStartDate, getSelectionRequirement } from "@/server/enrolment/planRules";
import { resolveMoveClassDates } from "@/server/enrolment/moveStudentToClassDates";
import { assertPlanMatchesTemplates } from "@/server/enrolment/planCompatibility";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { listScheduledOccurrences } from "@/server/billing/paidThroughDate";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { computeProratedPaidThrough, getPlanUnitPriceCents } from "@/server/enrolment/moveStudentToClassProration";
import { getCapacityIssueForTemplateRange } from "@/server/class/capacity";
import type { CapacityExceededDetails } from "@/lib/capacityError";
import {
  adjustCreditsForManualPaidThroughDate,
  recalculateEnrolmentCoverage,
  recomputeEnrolmentComputedFields,
} from "@/server/billing/enrolmentBilling";
import { createInvoiceWithLineItems, createPaymentAndAllocate } from "@/server/billing/invoiceMutations";

const payloadSchema = z.object({
  studentId: z.string().min(1),
  fromClassId: z.string().min(1),
  toClassId: z.string().min(1),
  toEnrolmentPlanId: z.string().min(1),
  effectiveDate: z.string().min(1),
  allowOverload: z.boolean().optional(),
});

type MoveStudentResult =
  | {
      ok: true;
      data: {
        oldEnrolmentId: string;
        newEnrolmentId: string;
        familyId: string | null;
        studentId: string;
        adjustmentInvoiceId: string | null;
        creditInvoiceId: string | null;
        paymentId: string | null;
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

async function countOccurrencesBetween(params: {
  client: Prisma.TransactionClient;
  template: { id: string; dayOfWeek: number | null; levelId: string | null };
  startDate: Date;
  endDate: Date;
}) {
  const start = brisbaneStartOfDay(params.startDate);
  const end = brisbaneStartOfDay(params.endDate);
  if (isAfter(start, end)) return 0;

  const templateIds = [params.template.id];
  const levelIds = [params.template.levelId ?? null];
  const [holidays, cancellations] = await Promise.all([
    params.client.holiday.findMany({
      where: {
        startDate: { lte: end },
        endDate: { gte: start },
        ...buildHolidayScopeWhere({ templateIds, levelIds }),
      },
      select: { startDate: true, endDate: true, levelId: true, templateId: true },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    }),
    params.client.classCancellation.findMany({
      where: {
        templateId: { in: templateIds },
        date: { gte: start, lte: end },
      },
      select: { templateId: true, date: true },
    }),
  ]);

  const occurrences = listScheduledOccurrences({
    startDate: start,
    endDate: end,
    classTemplate: { dayOfWeek: params.template.dayOfWeek },
    holidays,
    cancellations: cancellations.map((cancellation) => cancellation.date),
  });

  return occurrences.length;
}

export async function moveStudentToClass(input: z.input<typeof payloadSchema>): Promise<MoveStudentResult> {
  try {
    const user = await getOrCreateUser();
    await requireAdmin();

    const payload = payloadSchema.parse(input);
    const effectiveDate = normalizeStartDate(payload.effectiveDate);

    const result = await prisma.$transaction(async (tx) => {
      if (payload.fromClassId === payload.toClassId) {
        throw new Error("Select a different destination class.");
      }

      const [student, fromTemplate, toTemplate, plan] = await Promise.all([
        tx.student.findUnique({
          where: { id: payload.studentId },
          select: { id: true, familyId: true, levelId: true },
        }),
        tx.classTemplate.findUnique({ where: { id: payload.fromClassId } }),
        tx.classTemplate.findUnique({ where: { id: payload.toClassId } }),
        tx.enrolmentPlan.findUnique({ where: { id: payload.toEnrolmentPlanId } }),
      ]);

      if (!student) throw new Error("Student not found.");
      if (!fromTemplate) throw new Error("Source class not found.");
      if (!toTemplate) throw new Error("Destination class not found.");
      if (!plan) throw new Error("Destination enrolment plan not found.");
      if (!toTemplate.levelId) throw new Error("Destination class must have a level.");
      if (plan.levelId !== toTemplate.levelId) {
        throw new Error("Destination enrolment plan must match the destination class level.");
      }

      if (plan.billingType === BillingType.PER_WEEK && !plan.durationWeeks) {
        throw new Error("Weekly plans require durationWeeks.");
      }
      if (plan.billingType === BillingType.PER_CLASS && plan.blockClassCount != null && plan.blockClassCount <= 0) {
        throw new Error("Per-class plans require a positive class count.");
      }

      const requirement = getSelectionRequirement(plan);
      if (requirement.maxCount > 1 || requirement.requiredCount > 1) {
        throw new Error("Selected plan requires multiple class templates.");
      }

      assertPlanMatchesTemplates(plan, [toTemplate]);

      const enrolment = await tx.enrolment.findFirst({
        where: {
          studentId: payload.studentId,
          status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] },
          startDate: { lte: effectiveDate },
          OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }],
          AND: [
            {
              OR: [
                { templateId: payload.fromClassId },
                { classAssignments: { some: { templateId: payload.fromClassId } } },
              ],
            },
          ],
        },
        include: {
          plan: true,
          student: { select: { familyId: true, levelId: true } },
          template: true,
          classAssignments: { include: { template: true } },
        },
      });

      if (!enrolment) {
        throw new Error("No active enrolment found for the source class.");
      }
      if (!enrolment.plan) {
        throw new Error("Current enrolment is missing a plan.");
      }

      const templateStart = startOfDay(toTemplate.startDate);
      const templateEnd = toTemplate.endDate ? startOfDay(toTemplate.endDate) : null;
      const { alignedStart, plannedEnd, effectiveEnd } = resolveMoveClassDates({
        effectiveDate,
        enrolmentStart: startOfDay(enrolment.startDate),
        enrolmentEnd: enrolment.endDate ? startOfDay(enrolment.endDate) : null,
        templateStart,
        templateEnd,
        plan,
      });
      const capacityIssue = await getCapacityIssueForTemplateRange({
        template: {
          id: toTemplate.id,
          levelId: toTemplate.levelId ?? "",
          active: toTemplate.active ?? true,
          startDate: toTemplate.startDate,
          endDate: toTemplate.endDate,
          name: toTemplate.name,
          dayOfWeek: toTemplate.dayOfWeek,
          startTime: toTemplate.startTime,
          capacity: toTemplate.capacity,
        },
        plan,
        windowStart: alignedStart,
        windowEnd: plannedEnd ?? null,
        client: tx,
      });

      if (capacityIssue && !payload.allowOverload) {
        return { capacityIssue };
      }

      if (capacityIssue && payload.allowOverload) {
        console.info("[capacity] overload confirmed for moveStudentToClass", {
          templateId: capacityIssue.templateId,
          occurrenceDateKey: capacityIssue.occurrenceDateKey,
          capacity: capacityIssue.capacity,
          currentCount: capacityIssue.currentCount,
          projectedCount: capacityIssue.projectedCount,
        });
      }

      const oldPaidThrough = enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null;
      const newPaidThrough = oldPaidThrough ? brisbaneStartOfDay(oldPaidThrough) : null;
      const today = brisbaneStartOfDay(new Date());
      if (
        isBefore(alignedStart, today) &&
        newPaidThrough &&
        isAfter(newPaidThrough, alignedStart)
      ) {
        throw new Error(
          "Cannot move enrolments in the past when paid-through coverage already extends beyond the effective date."
        );
      }

      const nextEnrolment = await tx.enrolment.create({
        data: {
          templateId: toTemplate.id,
          studentId: enrolment.studentId,
          startDate: alignedStart,
          endDate: plannedEnd,
          status: EnrolmentStatus.ACTIVE,
          planId: plan.id,
          billingGroupId: enrolment.billingGroupId ?? enrolment.id,
          paidThroughDate: newPaidThrough,
          paidThroughDateComputed: newPaidThrough,
          creditsRemaining: plan.billingType === BillingType.PER_CLASS ? 0 : null,
          creditsBalanceCached: plan.billingType === BillingType.PER_CLASS ? 0 : null,
        },
        include: { plan: true, template: true, classAssignments: true },
      });

      await tx.enrolmentClassAssignment.createMany({
        data: [{ enrolmentId: nextEnrolment.id, templateId: toTemplate.id }],
        skipDuplicates: true,
      });

      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: {
          endDate: effectiveEnd,
          status: EnrolmentStatus.CHANGEOVER,
          cancelledAt: null,
        },
      });

      if (student.levelId !== toTemplate.levelId) {
        await tx.studentLevelChange.create({
          data: {
            studentId: student.id,
            fromLevelId: student.levelId,
            toLevelId: toTemplate.levelId,
            effectiveDate: alignedStart,
            note: "Class move",
            createdById: user.id,
          },
        });
        await tx.student.update({
          where: { id: student.id },
          data: { levelId: toTemplate.levelId },
        });
      }

      const nextEnrolmentWithTemplates = await tx.enrolment.findUnique({
        where: { id: nextEnrolment.id },
        include: {
          plan: true,
          template: true,
          classAssignments: { include: { template: true } },
        },
      });
      if (!nextEnrolmentWithTemplates) {
        throw new Error("Unable to load the new enrolment.");
      }

      if (plan.billingType === BillingType.PER_CLASS) {
        await adjustCreditsForManualPaidThroughDate(tx, nextEnrolmentWithTemplates, newPaidThrough);
        await recomputeEnrolmentComputedFields(nextEnrolment.id, { client: tx, asOfDate: alignedStart });
      } else {
        await recalculateEnrolmentCoverage(nextEnrolment.id, "CLASS_CHANGED", {
          tx,
          actorId: user.id,
        });
      }

      let adjustmentInvoiceId: string | null = null;
      let creditInvoiceId: string | null = null;
      let paymentId: string | null = null;
      const familyId = student.familyId ?? enrolment.student.familyId ?? null;

      if (oldPaidThrough && newPaidThrough) {
        const proratedPaidThrough = computeProratedPaidThrough({
          effectiveDate: alignedStart,
          oldPaidThroughDate: newPaidThrough,
          oldPlan: enrolment.plan,
          newPlan: plan,
          destinationTemplates: [{ dayOfWeek: toTemplate.dayOfWeek }],
        });

        if (proratedPaidThrough) {
          const startKey = toBrisbaneDayKey(newPaidThrough);
          const endKey = toBrisbaneDayKey(proratedPaidThrough);
          if (startKey !== endKey) {
            const deltaStart =
              isAfter(proratedPaidThrough, newPaidThrough) ? addDays(newPaidThrough, 1) : addDays(proratedPaidThrough, 1);
            const deltaEnd = isAfter(proratedPaidThrough, newPaidThrough) ? proratedPaidThrough : newPaidThrough;
            const totalOccurrences = await countOccurrencesBetween({
              client: tx,
              template: {
                id: toTemplate.id,
                dayOfWeek: toTemplate.dayOfWeek,
                levelId: toTemplate.levelId ?? null,
              },
              startDate: deltaStart,
              endDate: deltaEnd,
            });

            const unitPrice = getPlanUnitPriceCents(plan);
            const adjustmentCents = Math.round(totalOccurrences * unitPrice);

            if (adjustmentCents > 0) {
              if (isAfter(proratedPaidThrough, newPaidThrough)) {
                if (!familyId) {
                  throw new Error("Family not found for billing adjustment.");
                }
                const creditInvoice = await createInvoiceWithLineItems({
                  familyId,
                  enrolmentId: nextEnrolment.id,
                  lineItems: [
                    {
                      kind: InvoiceLineItemKind.ADJUSTMENT,
                      description: "Class move credit",
                      quantity: 1,
                      amountCents: -adjustmentCents,
                    },
                  ],
                  status: InvoiceStatus.PAID,
                  issuedAt: new Date(),
                  dueAt: new Date(),
                  client: tx,
                  skipAuth: true,
                });
                creditInvoiceId = creditInvoice.id;

                const payment = await createPaymentAndAllocate({
                  familyId,
                  amountCents: adjustmentCents,
                  method: "credit",
                  note: "Class move credit",
                  strategy: "oldest-open-first",
                  client: tx,
                  skipAuth: true,
                });
                paymentId = payment.payment.id;
              } else {
                if (!familyId) {
                  throw new Error("Family not found for billing adjustment.");
                }
                const invoice = await createInvoiceWithLineItems({
                  familyId,
                  enrolmentId: nextEnrolment.id,
                  lineItems: [
                    {
                      kind: InvoiceLineItemKind.ADJUSTMENT,
                      description: "Class move adjustment",
                      quantity: 1,
                      amountCents: adjustmentCents,
                    },
                  ],
                  status: InvoiceStatus.SENT,
                  issuedAt: new Date(),
                  dueAt: new Date(),
                  client: tx,
                  skipAuth: true,
                });
                adjustmentInvoiceId = invoice.id;
              }
            }
          }
        }
      }

      return {
        data: {
          oldEnrolmentId: enrolment.id,
          newEnrolmentId: nextEnrolment.id,
          familyId: enrolment.student.familyId ?? null,
          studentId: enrolment.studentId,
          adjustmentInvoiceId,
          creditInvoiceId,
          paymentId,
        },
      };
    });

    if ("capacityIssue" in result && result.capacityIssue) {
      console.info("[capacity] exceeded for moveStudentToClass", {
        templateId: result.capacityIssue.templateId,
        occurrenceDateKey: result.capacityIssue.occurrenceDateKey,
        capacity: result.capacityIssue.capacity,
        currentCount: result.capacityIssue.currentCount,
        projectedCount: result.capacityIssue.projectedCount,
      });
      return { ok: false, error: { code: "CAPACITY_EXCEEDED", details: result.capacityIssue } };
    }

    revalidatePath(`/admin/student/${result.data.studentId}`);
    revalidatePath(`/admin/class/${payload.fromClassId}`);
    revalidatePath(`/admin/class/${payload.toClassId}`);
    if (result.data.familyId) {
      revalidatePath(`/admin/family/${result.data.familyId}`);
    }
    revalidatePath("/admin/enrolment");

    return { ok: true as const, data: result.data };
  } catch (error) {
    if (error instanceof Error) {
      return {
        ok: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message || "Unable to move class.",
        },
      };
    }
    return {
      ok: false as const,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Unable to move class.",
      },
    };
  }
}
