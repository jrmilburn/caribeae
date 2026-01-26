import { BillingType, EnrolmentCreditEventType, InvoiceLineItemKind, InvoiceStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import { normalizeDate } from "@/server/invoicing/dateUtils";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";
import { getWeeklyPaidThrough } from "@/server/billing/enrolmentBilling";
import { resolveWeeklyPayAheadSequence } from "@/server/invoicing/coverage";
import { recalculateEnrolmentCoverage } from "@/server/billing/recalculateEnrolmentCoverage";
import { normalizeCoverageEndForStorage } from "@/server/invoicing/applyPaidInvoiceToEnrolment";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";
import { buildCustomPayAheadNote } from "@/lib/billing/customPayAheadNote";
import { computeBlockPayAheadCoverage } from "@/lib/billing/payAheadCalculator";
import { assertWeeklyPlanSelection, resolveEnrolmentTemplates } from "@/server/billing/weeklyPlanSelection";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export type RecordPaymentInput = {
  familyId: string;
  amountCents: number;
  paidAt?: Date;
  method?: string;
  note?: string;
  enrolmentId?: string;
  customBlockLength?: number | null;
  planId?: string;
  idempotencyKey?: string;
  client?: PrismaClientOrTx;
};

export async function recordPayment(input: RecordPaymentInput): Promise<{
  payment: Prisma.PaymentGetPayload<object>;
  receiptInvoiceId?: string;
}> {
  if (input.amountCents <= 0) {
    throw new Error("Payment amount must be positive.");
  }

  const client = input.client ?? prisma;
  const run = async (tx: Prisma.TransactionClient) => {
    if (input.idempotencyKey) {
      const existing = await tx.payment.findFirst({
        where: { familyId: input.familyId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        const allocation = await tx.paymentAllocation.findFirst({
          where: { paymentId: existing.id },
          select: { invoiceId: true },
        });
        return { payment: existing, receiptInvoiceId: allocation?.invoiceId };
      }
    }

    const paidAt = input.paidAt ?? new Date();

    if (!input.enrolmentId) {
      const payment = await tx.payment.create({
        data: {
          familyId: input.familyId,
          amountCents: input.amountCents,
          paidAt,
          method: input.method?.trim() || undefined,
          note: input.note?.trim() || undefined,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      return { payment };
    }

    const enrolment = await tx.enrolment.findUnique({
      where: { id: input.enrolmentId },
      include: {
        plan: true,
        student: { select: { familyId: true } },
        template: { select: { id: true, dayOfWeek: true, name: true, startTime: true, levelId: true } },
        classAssignments: {
          include: { template: { select: { id: true, dayOfWeek: true, startTime: true, levelId: true } } },
        },
      },
    });

    if (!enrolment?.plan) {
      throw new Error("Enrolment plan missing.");
    }
    if (enrolment.student.familyId !== input.familyId) {
      throw new Error("Enrolment does not belong to family.");
    }

    let plan = enrolment.plan;
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
        levelId: assignment.template?.levelId ?? null,
      })),
    });
    if (input.planId) {
      if (plan.billingType !== BillingType.PER_WEEK) {
        throw new Error("Only weekly plans can be changed for payment.");
      }
      const selectedPlan = await tx.enrolmentPlan.findUnique({
        where: { id: input.planId },
      });
      if (!selectedPlan) {
        throw new Error("Selected plan could not be found.");
      }
      assertWeeklyPlanSelection({
        plan: selectedPlan,
        currentLevelId: plan.levelId,
        templates,
      });
      plan = selectedPlan;
    }
    const planBlockLength = resolveBlockLength(plan.blockClassCount);
    const customBlockLength = input.customBlockLength ?? null;
    if (customBlockLength != null) {
      if (plan.billingType !== BillingType.PER_CLASS) {
        throw new Error("Custom block length is only allowed for block-based plans.");
      }
      if (!Number.isInteger(customBlockLength)) {
        throw new Error("Custom block length must be an integer.");
      }
      if (customBlockLength < planBlockLength) {
        throw new Error("Custom block length must be at least the plan block length.");
      }
    }
    const pricing = calculateBlockPricing({
      priceCents: plan.priceCents,
      blockLength: planBlockLength,
      customBlockLength: customBlockLength ?? undefined,
    });
    const paymentAmountCents =
      plan.billingType === BillingType.PER_WEEK && input.planId
        ? plan.priceCents
        : plan.billingType === BillingType.PER_CLASS && customBlockLength
          ? pricing.totalCents
          : input.amountCents;

    const payment = await tx.payment.create({
      data: {
        familyId: input.familyId,
        amountCents: paymentAmountCents,
        paidAt,
        method: input.method?.trim() || undefined,
        note: input.note?.trim() || undefined,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    let coverageStart: Date | null = null;
    let coverageEnd: Date | null = null;
    let coverageEndBase: Date | null = null;
    let creditsPurchased: number | null = null;

    if (plan.billingType === BillingType.PER_WEEK) {
      if (!enrolment.template) {
        throw new Error("Class template missing for enrolment.");
      }
      assertPlanMatchesTemplate(plan, enrolment.template);

      const durationWeeks = plan.durationWeeks;
      if (!durationWeeks || durationWeeks <= 0) {
        throw new Error("Weekly plans require durationWeeks to be greater than zero.");
      }

      const assignedTemplates = enrolment.classAssignments.length
        ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
        : enrolment.template
          ? [enrolment.template]
          : [];
      const paidThrough = getWeeklyPaidThrough(enrolment);
      const payAhead = resolveWeeklyPayAheadSequence({
        startDate: enrolment.startDate,
        endDate: enrolment.endDate,
        paidThroughDate: paidThrough,
        durationWeeks,
        sessionsPerWeek: plan.sessionsPerWeek ?? null,
        quantity: 1,
        assignedTemplates,
        holidays: [],
        today: paidAt,
      });

      coverageStart = payAhead.coverageStart;
      coverageEnd = payAhead.coverageEnd;
      coverageEndBase = payAhead.coverageEnd;

      if (!coverageEnd) {
        throw new Error("Unable to resolve coverage end.");
      }

      const normalizedCoverageEnd = normalizeCoverageEndForStorage(coverageEnd);
      const normalizedCoverageEndBase = coverageEndBase
        ? normalizeCoverageEndForStorage(coverageEndBase)
        : normalizedCoverageEnd;

      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: {
          paidThroughDate: normalizedCoverageEnd,
          paidThroughDateComputed: normalizedCoverageEndBase,
        },
      });

      await recalculateEnrolmentCoverage(enrolment.id, "INVOICE_APPLIED", { tx, actorId: undefined });
    } else if (plan.billingType === BillingType.PER_CLASS) {
      const creditsToAdd = customBlockLength ?? planBlockLength;
      if (creditsToAdd <= 0) {
        throw new Error("PER_CLASS plans require blockClassCount to be greater than zero when provided.");
      }

      const assignedTemplates = enrolment.classAssignments.length
        ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
        : enrolment.template
          ? [enrolment.template]
          : [];
      const anchorTemplate = assignedTemplates.find((template) => template.dayOfWeek != null) ?? enrolment.template;
      if (anchorTemplate?.dayOfWeek != null) {
      const templateIds = assignedTemplates.map((template) => template.id);
      const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
      const holidays = await tx.holiday.findMany({
        where: buildHolidayScopeWhere({ templateIds, levelIds }),
        select: { startDate: true, endDate: true, levelId: true, templateId: true },
      });
        const coverageRange = computeBlockPayAheadCoverage({
          currentPaidThroughDate: enrolment.paidThroughDate ?? null,
          enrolmentStartDate: enrolment.startDate,
          enrolmentEndDate: enrolment.endDate ?? null,
          classTemplate: { dayOfWeek: anchorTemplate.dayOfWeek, startTime: anchorTemplate.startTime ?? null },
          assignedTemplates: assignedTemplates.map((template) => ({
            dayOfWeek: template.dayOfWeek,
            startTime: template.startTime ?? null,
          })),
          blocksPurchased: 1,
          blockClassCount: planBlockLength,
          creditsPurchased: creditsToAdd,
          holidays,
        });
        coverageStart = coverageRange.coverageStart;
        coverageEnd = coverageRange.coverageEnd;
      }

      creditsPurchased = creditsToAdd;
      await tx.enrolmentCreditEvent.create({
        data: {
          enrolmentId: enrolment.id,
          type: EnrolmentCreditEventType.PURCHASE,
          creditsDelta: creditsToAdd,
          occurredOn: normalizeDate(paidAt),
          note: "Payment recorded",
        },
      });

      const aggregate = await tx.enrolmentCreditEvent.aggregate({
        where: { enrolmentId: enrolment.id },
        _sum: { creditsDelta: true },
      });
      const balance = aggregate._sum.creditsDelta ?? 0;
      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: {
          creditsBalanceCached: balance,
          creditsRemaining: balance,
        },
      });

      await recalculateEnrolmentCoverage(enrolment.id, "INVOICE_APPLIED", { tx, actorId: undefined });
    }

    const receiptInvoice = await tx.invoice.create({
      data: {
        familyId: input.familyId,
        enrolmentId: enrolment.id,
        amountCents: payment.amountCents,
        amountPaidCents: payment.amountCents,
        status: InvoiceStatus.PAID,
        issuedAt: paidAt,
        dueAt: paidAt,
        paidAt,
        coverageStart,
        coverageEnd,
        creditsPurchased,
        entitlementsAppliedAt: new Date(),
      },
    });

    await tx.invoiceLineItem.create({
      data: {
        invoiceId: receiptInvoice.id,
        kind: InvoiceLineItemKind.ENROLMENT,
        description:
          customBlockLength != null && customBlockLength !== planBlockLength
            ? `${plan.name} · ${buildCustomPayAheadNote({
                totalClasses: creditsPurchased ?? customBlockLength ?? planBlockLength,
                coverageStart,
                coverageEnd,
                perClassPriceCents: pricing.perClassPriceCents,
              })}`
            : plan.name,
        quantity: 1,
        unitPriceCents: payment.amountCents,
        amountCents: payment.amountCents,
        enrolmentId: enrolment.id,
      },
    });

    await tx.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId: receiptInvoice.id,
        amountCents: payment.amountCents,
      },
    });

    return { payment, receiptInvoiceId: receiptInvoice.id };
  };

  if (typeof (client as PrismaClient).$transaction === "function") {
    return (client as PrismaClient).$transaction((tx) => run(tx));
  }
  return run(client as Prisma.TransactionClient);
}
