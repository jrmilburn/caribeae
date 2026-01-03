"use server";

import { addDays, isAfter } from "date-fns";
import { BillingType, InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInvoiceWithLineItems } from "./invoiceMutations";
import { getEnrolmentBillingStatus, getWeeklyPaidThrough } from "./enrolmentBilling";
import { resolveWeeklyPayAheadSequence } from "@/server/invoicing/coverage";
import { normalizeDate, normalizeOptionalDate } from "@/server/invoicing/dateUtils";

const inputSchema = z.object({
  enrolmentId: z.string().min(1),
  periods: z.number().int().positive().max(12).optional(),
});

export type CreatePayAheadInvoiceInput = z.infer<typeof inputSchema>;

export async function createPayAheadInvoice(input: CreatePayAheadInvoiceInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = inputSchema.parse(input);
  const periods = payload.periods ?? 1;

  const enrolment = await prisma.enrolment.findUnique({
    where: { id: payload.enrolmentId },
    include: {
      plan: true,
      student: { select: { familyId: true } },
    },
  });

  if (!enrolment) throw new Error("Enrolment not found.");
  if (!enrolment.plan) throw new Error("Enrolment plan missing.");
  if (enrolment.plan.billingType !== BillingType.PER_WEEK) {
    throw new Error("Pay-ahead invoices are only supported for weekly plans.");
  }
  if (!enrolment.plan.durationWeeks) {
    throw new Error("Weekly plans require a duration in weeks.");
  }

  const billing = await getEnrolmentBillingStatus(enrolment.id, { client: prisma });

  const today = normalizeDate(new Date(), "today");
  const paidThrough = billing.paidThroughDate ?? getWeeklyPaidThrough(enrolment);
  const enrolmentEnd = normalizeOptionalDate(enrolment.endDate);

  const payAhead = resolveWeeklyPayAheadSequence({
    startDate: enrolment.startDate,
    endDate: enrolmentEnd,
    paidThroughDate: paidThrough,
    durationWeeks: enrolment.plan.durationWeeks,
    quantity: periods,
    today,
  });

  if (payAhead.periods === 0 || !payAhead.coverageStart || !payAhead.coverageEnd) {
    throw new Error("No remaining periods to invoice for this enrolment.");
  }

  const issuedAt = today;
  const dueAt = addDays(issuedAt, 7);

  const invoice = await createInvoiceWithLineItems({
    familyId: enrolment.student.familyId,
    enrolmentId: enrolment.id,
    lineItems: [
      {
        kind: InvoiceLineItemKind.ENROLMENT,
        description: enrolment.plan.name,
        quantity: payAhead.periods,
        unitPriceCents: enrolment.plan.priceCents,
      },
    ],
    status: InvoiceStatus.SENT,
    coverageStart: payAhead.coverageStart,
    coverageEnd: payAhead.coverageEnd,
    creditsPurchased: null,
    issuedAt,
    dueAt,
  });

  return { invoice, periods: payAhead.periods };
}
