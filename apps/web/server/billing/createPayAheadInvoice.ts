"use server";

import { addDays, addWeeks, isAfter, max as maxDate } from "date-fns";
import { BillingType, InvoiceStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

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

  const durationWeeks = enrolment.plan.durationWeeks;

  const latestCoverage = await prisma.invoice.aggregate({
    where: { enrolmentId: enrolment.id, coverageEnd: { not: null } },
    _max: { coverageEnd: true },
  });

  const today = new Date();
  const coverageStart = maxDate(
    [enrolment.startDate, enrolment.paidThroughDate ?? enrolment.startDate, latestCoverage._max.coverageEnd ?? enrolment.startDate, today].filter(
      Boolean
    ) as Date[]
  );

  if (enrolment.endDate && isAfter(coverageStart, enrolment.endDate)) {
    throw new Error("Enrolment end date has passed.");
  }

  let currentStart = coverageStart;
  let coverageEnd = coverageStart;
  let createdPeriods = 0;

  for (let i = 0; i < periods; i++) {
    if (enrolment.endDate && isAfter(currentStart, enrolment.endDate)) break;

    const rawEnd = addWeeks(currentStart, durationWeeks);
    coverageEnd = enrolment.endDate && isAfter(rawEnd, enrolment.endDate) ? enrolment.endDate : rawEnd;
    currentStart = coverageEnd;
    createdPeriods += 1;
  }

  if (createdPeriods === 0) {
    throw new Error("No remaining periods to invoice for this enrolment.");
  }

  const issuedAt = today;
  const dueAt = addDays(issuedAt, 7);

  const invoice = await prisma.invoice.create({
    data: {
      familyId: enrolment.student.familyId,
      enrolmentId: enrolment.id,
      amountCents: enrolment.plan.priceCents * createdPeriods,
      amountPaidCents: 0,
      status: InvoiceStatus.SENT,
      coverageStart,
      coverageEnd,
      creditsPurchased: null,
      issuedAt,
      dueAt,
    },
  });

  return { invoice, periods: createdPeriods };
}
