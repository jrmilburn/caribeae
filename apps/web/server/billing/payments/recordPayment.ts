import { BillingType, EnrolmentCreditEventType, InvoiceLineItemKind, InvoiceStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import { normalizeDate } from "@/server/invoicing/dateUtils";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";
import { computeCoverageEndDay, dayKeyToDate, nextScheduledDayKey } from "@/server/billing/coverageEngine";
import { brisbaneAddDays, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { recomputeEnrolmentCoverage } from "@/server/billing/recomputeEnrolmentCoverage";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export type RecordPaymentInput = {
  familyId: string;
  amountCents: number;
  paidAt?: Date;
  method?: string;
  note?: string;
  enrolmentId?: string;
  idempotencyKey?: string;
  client?: PrismaClientOrTx;
};

export async function recordPayment(input: RecordPaymentInput): Promise<{
  payment: Prisma.PaymentGetPayload<{}>;
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

    if (!input.enrolmentId) {
      return { payment };
    }

    const enrolment = await tx.enrolment.findUnique({
      where: { id: input.enrolmentId },
      include: {
        plan: true,
        student: { select: { familyId: true } },
        template: { select: { dayOfWeek: true } },
        classAssignments: { include: { template: { select: { dayOfWeek: true } } } },
      },
    });

    if (!enrolment?.plan) {
      throw new Error("Enrolment plan missing.");
    }
    if (enrolment.student.familyId !== input.familyId) {
      throw new Error("Enrolment does not belong to family.");
    }

    const plan = enrolment.plan;
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

      const sessionsPerWeek = plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
      const entitlementSessions = durationWeeks * sessionsPerWeek;

      const assignedTemplates = enrolment.classAssignments.length
        ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
        : enrolment.template
          ? [enrolment.template]
          : [];

      const holidays = await tx.holiday.findMany({ select: { startDate: true, endDate: true } });
      const enrolmentEndDayKey = enrolment.endDate ? toBrisbaneDayKey(enrolment.endDate) : null;
      const baseStartDayKey = enrolment.paidThroughDate
        ? brisbaneAddDays(toBrisbaneDayKey(enrolment.paidThroughDate), 1)
        : toBrisbaneDayKey(enrolment.startDate);

      const coverageStartDayKey = nextScheduledDayKey({
        startDayKey: baseStartDayKey,
        assignedTemplates,
        holidays,
        endDayKey: enrolmentEndDayKey,
      });

      if (!coverageStartDayKey) {
        throw new Error("Unable to resolve next coverage start.");
      }

      const coverageEndDayKey = computeCoverageEndDay({
        startDayKey: coverageStartDayKey,
        assignedTemplates,
        holidays,
        entitlementSessions,
        endDayKey: enrolmentEndDayKey,
      });

      const coverageEndBaseDayKey = computeCoverageEndDay({
        startDayKey: coverageStartDayKey,
        assignedTemplates,
        holidays: [],
        entitlementSessions,
        endDayKey: enrolmentEndDayKey,
      });

      coverageStart = dayKeyToDate(coverageStartDayKey);
      coverageEnd = dayKeyToDate(coverageEndDayKey);
      coverageEndBase = dayKeyToDate(coverageEndBaseDayKey);

      if (!coverageEnd) {
        throw new Error("Unable to resolve coverage end.");
      }

      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: {
          paidThroughDate: coverageEnd,
          paidThroughDateComputed: coverageEndBase ?? coverageEnd,
        },
      });

      await recomputeEnrolmentCoverage(enrolment.id, "INVOICE_APPLIED", { client: tx });
    } else if (plan.billingType === BillingType.PER_CLASS) {
      const creditsToAdd = plan.blockClassCount ?? 1;
      if (creditsToAdd <= 0) {
        throw new Error("PER_CLASS plans require blockClassCount to be greater than zero when provided.");
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
        description: plan.name,
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
