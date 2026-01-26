"use server";

import { addDays } from "date-fns";
import { BillingType, InvoiceLineItemKind, InvoiceStatus, type EnrolmentPlan, type Invoice } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInvoiceWithLineItems, createPaymentAndAllocate } from "./invoiceMutations";
import { getBillingStatusForEnrolments, getWeeklyPaidThrough } from "./enrolmentBilling";
import { resolveWeeklyPayAheadSequence } from "@/server/invoicing/coverage";
import { normalizeDate, normalizeOptionalDate } from "@/server/invoicing/dateUtils";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";
import { computeBlockPayAheadCoverage } from "@/lib/billing/payAheadCalculator";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";
import { buildCustomPayAheadNote } from "@/lib/billing/customPayAheadNote";
import { enrolmentIsPayable } from "@/lib/enrolment/enrolmentVisibility";
import { assertWeeklyPlanSelection, resolveEnrolmentTemplates } from "@/server/billing/weeklyPlanSelection";

const payAheadItemSchema = z.object({
  enrolmentId: z.string().min(1),
  quantity: z.number().int().positive().max(24).default(1),
  customBlockLength: z.number().int().positive().optional(),
  planId: z.string().min(1).optional(),
});

const payAheadSchema = z.object({
  familyId: z.string().min(1),
  method: z.string().trim().max(100).optional(),
  note: z.string().trim().max(1000).optional(),
  paidAt: z.coerce.date().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
  items: z.array(payAheadItemSchema).min(1),
});

export type PayAheadAndPayInput = z.infer<typeof payAheadSchema>;

function blockSize(plan: EnrolmentPlan | null) {
  if (!plan) return 0;
  const size = resolveBlockLength(plan.blockClassCount);
  return size > 0 ? size : 0;
}

export async function payAheadAndPay(input: PayAheadAndPayInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = payAheadSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const enrolments = await tx.enrolment.findMany({
      where: { id: { in: payload.items.map((i) => i.enrolmentId) } },
      include: {
        plan: true,
        student: { select: { familyId: true, name: true } },
        template: { select: { id: true, dayOfWeek: true, name: true, startTime: true, levelId: true } },
        classAssignments: { include: { template: { select: { id: true, dayOfWeek: true, name: true, startTime: true, levelId: true } } } },
      },
    });

    const selectedPlanIds = payload.items.map((item) => item.planId).filter(Boolean) as string[];
    const selectedPlans = selectedPlanIds.length
      ? await tx.enrolmentPlan.findMany({
          where: { id: { in: selectedPlanIds } },
        })
      : [];
    const selectedPlanMap = new Map(selectedPlans.map((plan) => [plan.id, plan]));

    if (enrolments.length !== payload.items.length) {
      throw new Error("Some enrolments could not be found.");
    }

    const familyId = enrolments[0]?.student.familyId;
    if (familyId !== payload.familyId || enrolments.some((e) => e.student.familyId !== familyId)) {
      throw new Error("Selected enrolments must belong to the same family.");
    }

    const statusMap = await getBillingStatusForEnrolments(
      enrolments.map((e) => e.id),
      { client: tx }
    );

    const today = new Date();
    const createdInvoices: { invoice: Invoice; enrolmentId: string }[] = [];
    const issuedAt = new Date();
    const dueAt = addDays(issuedAt, 7);

    for (const item of payload.items) {
      const enrolment = enrolments.find((e) => e.id === item.enrolmentId);
      if (!enrolment) throw new Error("Enrolment not found.");
      if (!enrolment.plan) throw new Error("Enrolment plan missing.");
      if (!enrolment.isBillingPrimary) {
        throw new Error("Secondary enrolments cannot be billed directly.");
      }
      if (!enrolment.template) throw new Error("Class template missing for enrolment.");
      if (
        !enrolmentIsPayable({
          status: enrolment.status,
          paidThroughDate: enrolment.paidThroughDate ?? null,
          endDate: enrolment.endDate ?? null,
        })
      ) {
        throw new Error("Only active or unpaid changeover enrolments can be billed ahead.");
      }

      const selectedPlan = item.planId ? selectedPlanMap.get(item.planId) : null;
      const templates = resolveEnrolmentTemplates({
        template: enrolment.template
          ? {
              dayOfWeek: enrolment.template.dayOfWeek ?? null,
              name: enrolment.template.name ?? null,
              levelId: enrolment.template.levelId ?? null,
            }
          : null,
        assignedTemplates: enrolment.classAssignments.map((assignment) => ({
          dayOfWeek: assignment.template?.dayOfWeek ?? null,
          name: assignment.template?.name ?? null,
          levelId: assignment.template?.levelId ?? null,
        })),
      });
      if (item.planId && !selectedPlan) {
        throw new Error("Selected plan could not be found.");
      }
      if (item.planId) {
        if (enrolment.plan.billingType !== BillingType.PER_WEEK) {
          throw new Error("Only weekly plans can be changed for pay-ahead payments.");
        }
        assertWeeklyPlanSelection({
          plan: selectedPlan!,
          currentLevelId: enrolment.plan.levelId,
          templates,
        });
      }
      const plan = selectedPlan ?? enrolment.plan;
      assertPlanMatchesTemplate(plan, enrolment.template);
      if (item.customBlockLength != null && plan.billingType !== BillingType.PER_CLASS) {
        throw new Error("Custom block length is only available for per-class plans.");
      }

      if (plan.billingType === BillingType.PER_WEEK) {
        if (!plan.durationWeeks || plan.durationWeeks <= 0) {
          throw new Error("Weekly plans require a duration in weeks.");
        }

        const enrolmentEnd = normalizeOptionalDate(enrolment.endDate);
        const paidThrough = statusMap.get(enrolment.id)?.paidThroughDate ?? getWeeklyPaidThrough(enrolment);
        const assignedTemplates = enrolment.classAssignments.length
          ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
          : enrolment.template
            ? [enrolment.template]
            : [];
        const templateIds = assignedTemplates.map((template) => template.id);
        const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
        const holidays = await tx.holiday.findMany({
          where: buildHolidayScopeWhere({ templateIds, levelIds }),
          select: { startDate: true, endDate: true, levelId: true, templateId: true },
        });
        const payAhead = resolveWeeklyPayAheadSequence({
          startDate: enrolment.startDate,
          endDate: enrolmentEnd,
          paidThroughDate: paidThrough,
          durationWeeks: plan.durationWeeks,
          sessionsPerWeek: plan.sessionsPerWeek ?? null,
          quantity: item.quantity,
          assignedTemplates,
          holidays,
          today,
        });

        if (payAhead.periods === 0 || !payAhead.coverageStart || !payAhead.coverageEnd) {
          throw new Error("No remaining periods to invoice for this enrolment.");
        }

        const invoice = await createInvoiceWithLineItems({
          familyId: payload.familyId,
          enrolmentId: enrolment.id,
          lineItems: [
            {
              kind: InvoiceLineItemKind.ENROLMENT,
              description: plan.name,
              quantity: payAhead.periods,
              unitPriceCents: plan.priceCents,
            },
          ],
          status: InvoiceStatus.SENT,
          coverageStart: payAhead.coverageStart,
          coverageEnd: payAhead.coverageEnd,
          creditsPurchased: null,
          issuedAt,
          dueAt,
          client: tx,
          skipAuth: true,
        });

        createdInvoices.push({ invoice, enrolmentId: enrolment.id });
      } else {
        const creditsPerBlock = blockSize(plan);
        if (!creditsPerBlock || creditsPerBlock <= 0) {
          throw new Error("Plan is missing block or class count details.");
        }
        if (item.customBlockLength != null) {
          if (!Number.isInteger(item.customBlockLength)) {
            throw new Error("Custom block length must be an integer.");
          }
          if (item.customBlockLength < creditsPerBlock) {
            throw new Error("Custom block length must be at least the plan block length.");
          }
        }
        const effectiveBlockLength = item.customBlockLength ?? creditsPerBlock;

        const assignedTemplates = enrolment.classAssignments.length
          ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
          : enrolment.template
            ? [enrolment.template]
            : [];
        const anchorTemplate = assignedTemplates.find((template) => template.dayOfWeek != null) ?? enrolment.template;
        if (anchorTemplate?.dayOfWeek == null) {
          throw new Error("Class template missing for enrolment.");
        }

        const enrolmentEnd = normalizeOptionalDate(enrolment.endDate);
        const templateIds = assignedTemplates.map((template) => template.id);
        const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
        const holidays = await tx.holiday.findMany({
          where: buildHolidayScopeWhere({ templateIds, levelIds }),
          select: { startDate: true, endDate: true, levelId: true, templateId: true },
        });

        const coverageRange = computeBlockPayAheadCoverage({
          currentPaidThroughDate: statusMap.get(enrolment.id)?.paidThroughDate ?? enrolment.paidThroughDate,
          enrolmentStartDate: enrolment.startDate,
          enrolmentEndDate: enrolmentEnd,
          classTemplate: {
            dayOfWeek: anchorTemplate.dayOfWeek,
            startTime: anchorTemplate.startTime ?? null,
          },
          assignedTemplates: assignedTemplates.map((template) => ({
            dayOfWeek: template.dayOfWeek,
            startTime: template.startTime ?? null,
          })),
          blocksPurchased: item.quantity,
          blockClassCount: creditsPerBlock,
          creditsPurchased: effectiveBlockLength * item.quantity,
          holidays,
        });

        if (!coverageRange.coverageStart || !coverageRange.coverageEnd) {
          throw new Error("Unable to calculate pay-ahead coverage for this enrolment.");
        }

        const pricing = calculateBlockPricing({
          priceCents: plan.priceCents,
          blockLength: creditsPerBlock,
          customBlockLength: effectiveBlockLength,
        });
        const customNote =
          item.customBlockLength != null && item.customBlockLength !== creditsPerBlock
            ? buildCustomPayAheadNote({
                totalClasses: effectiveBlockLength * item.quantity,
                coverageStart: coverageRange.coverageStart,
                coverageEnd: coverageRange.coverageEnd,
                perClassPriceCents: pricing.perClassPriceCents,
              })
            : null;
        const invoice = await createInvoiceWithLineItems({
          familyId: payload.familyId,
          enrolmentId: enrolment.id,
          lineItems: [
            {
              kind: InvoiceLineItemKind.ENROLMENT,
              description: customNote ? `${plan.name} · ${customNote}` : plan.name,
              quantity: item.quantity,
              unitPriceCents: pricing.totalCents,
            },
          ],
          status: InvoiceStatus.SENT,
          coverageStart: coverageRange.coverageStart,
          coverageEnd: coverageRange.coverageEnd,
          creditsPurchased: effectiveBlockLength * item.quantity,
          issuedAt,
          dueAt,
          client: tx,
          skipAuth: true,
        });

        createdInvoices.push({ invoice, enrolmentId: enrolment.id });
      }
    }

    const totalCents = createdInvoices.reduce((sum, entry) => sum + entry.invoice.amountCents, 0);
    if (totalCents <= 0) {
      throw new Error("Pay-ahead total must be positive.");
    }

    const paymentResult = await createPaymentAndAllocate({
      familyId: payload.familyId,
      amountCents: totalCents,
      allocations: createdInvoices.map(({ invoice }) => ({
        invoiceId: invoice.id,
        amountCents: invoice.amountCents,
      })),
      paidAt: normalizeDate(payload.paidAt ?? new Date(), "paidAt"),
      method: payload.method?.trim() || undefined,
      note: payload.note?.trim() || undefined,
      idempotencyKey: payload.idempotencyKey ?? undefined,
      client: tx,
      skipAuth: true,
    });

    return {
      paymentId: paymentResult.payment.id,
      invoiceIds: createdInvoices.map((c) => c.invoice.id),
      totalCents,
    };
  });
}
