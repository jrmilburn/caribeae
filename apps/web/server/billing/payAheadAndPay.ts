"use server";

import { addDays, addWeeks, isAfter, max as maxDate } from "date-fns";
import { BillingType, EnrolmentStatus, InvoiceLineItemKind, InvoiceStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInvoiceWithLineItems } from "./invoiceMutations";
import { getBillingStatusForEnrolments, getWeeklyPaidThrough } from "./enrolmentBilling";
import { adjustInvoicePayment } from "./utils";

const payAheadItemSchema = z.object({
  enrolmentId: z.string().min(1),
  quantity: z.number().int().positive().max(24).default(1),
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

function blockSize(plan: Prisma.EnrolmentPlan | null) {
  if (!plan) return 0;
  if (plan.billingType === BillingType.BLOCK) {
    return plan.blockClassCount ?? plan.blockLength ?? 0;
  }
  if (plan.billingType === BillingType.PER_CLASS) {
    return plan.blockLength ?? plan.blockClassCount ?? 1;
  }
  return 0;
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
      },
    });

    if (enrolments.length !== payload.items.length) {
      throw new Error("Some enrolments could not be found.");
    }

    const familyId = enrolments[0]?.student.familyId;
    if (familyId !== payload.familyId || enrolments.some((e) => e.student.familyId !== familyId)) {
      throw new Error("Selected enrolments must belong to the same family.");
    }

    const latestCoverage = await tx.invoice.groupBy({
      by: ["enrolmentId"],
      where: { enrolmentId: { in: enrolments.map((e) => e.id) }, coverageEnd: { not: null } },
      _max: { coverageEnd: true },
    });
    const latestCoverageMap = new Map<string, Date | null>(
      latestCoverage.map((c) => [c.enrolmentId, c._max.coverageEnd ? new Date(c._max.coverageEnd) : null])
    );

    const statusMap = await getBillingStatusForEnrolments(
      enrolments.map((e) => e.id),
      { client: tx }
    );

    const today = new Date();
    const createdInvoices: { invoice: Prisma.Invoice; enrolmentId: string }[] = [];

    for (const item of payload.items) {
      const enrolment = enrolments.find((e) => e.id === item.enrolmentId);
      if (!enrolment) throw new Error("Enrolment not found.");
      if (!enrolment.plan) throw new Error("Enrolment plan missing.");
      if (enrolment.status !== EnrolmentStatus.ACTIVE) {
        throw new Error("Only active enrolments can be billed ahead.");
      }

      const plan = enrolment.plan;

      if (plan.billingType === BillingType.PER_WEEK) {
        if (!plan.durationWeeks || plan.durationWeeks <= 0) {
          throw new Error("Weekly plans require a duration in weeks.");
        }

        const latestEnd = latestCoverageMap.get(enrolment.id) ?? enrolment.startDate;
        const paidThrough = statusMap.get(enrolment.id)?.paidThroughDate ?? getWeeklyPaidThrough(enrolment);
        const coverageStart = maxDate(
          [enrolment.startDate, paidThrough ?? enrolment.startDate, latestEnd, today].filter(Boolean) as Date[]
        );

        if (enrolment.endDate && isAfter(coverageStart, enrolment.endDate)) {
          throw new Error("Enrolment end date has passed.");
        }

        let currentStart = coverageStart;
        let coverageEnd = coverageStart;
        let createdPeriods = 0;

        for (let i = 0; i < item.quantity; i++) {
          if (enrolment.endDate && isAfter(currentStart, enrolment.endDate)) break;

          const rawEnd = addWeeks(currentStart, plan.durationWeeks);
          coverageEnd = enrolment.endDate && isAfter(rawEnd, enrolment.endDate) ? enrolment.endDate : rawEnd;
          currentStart = coverageEnd;
          createdPeriods += 1;
        }

        if (createdPeriods === 0) {
          throw new Error("No remaining periods to invoice for this enrolment.");
        }

        const issuedAt = today;
        const dueAt = addDays(issuedAt, 7);

        const invoice = await createInvoiceWithLineItems({
          familyId: payload.familyId,
          enrolmentId: enrolment.id,
          lineItems: [
            {
              kind: InvoiceLineItemKind.ENROLMENT,
              description: plan.name,
              quantity: createdPeriods,
              unitPriceCents: plan.priceCents,
            },
          ],
          status: InvoiceStatus.SENT,
          coverageStart,
          coverageEnd,
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

        const issuedAt = today;
        const dueAt = addDays(issuedAt, 7);
        const invoice = await createInvoiceWithLineItems({
          familyId: payload.familyId,
          enrolmentId: enrolment.id,
          lineItems: [
            {
              kind: InvoiceLineItemKind.ENROLMENT,
              description: plan.name,
              quantity: item.quantity,
              unitPriceCents: plan.priceCents,
            },
          ],
          status: InvoiceStatus.SENT,
          creditsPurchased: creditsPerBlock * item.quantity,
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

    const payment = await tx.payment.create({
      data: {
        familyId: payload.familyId,
        amountCents: totalCents,
        paidAt: payload.paidAt ?? today,
        method: payload.method?.trim() || undefined,
        note: payload.note?.trim() || undefined,
        idempotencyKey: payload.idempotencyKey ?? null,
      },
    });

    await tx.paymentAllocation.createMany({
      data: createdInvoices.map(({ invoice }) => ({
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountCents: invoice.amountCents,
      })),
    });

    for (const entry of createdInvoices) {
      await adjustInvoicePayment(tx, entry.invoice.id, entry.invoice.amountCents, payment.paidAt);
    }

    return {
      paymentId: payment.id,
      invoiceIds: createdInvoices.map((c) => c.invoice.id),
      totalCents,
    };
  });
}
