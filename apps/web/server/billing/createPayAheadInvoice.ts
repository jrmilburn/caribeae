"use server";

import { addDays } from "date-fns";
import { BillingType, InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInvoiceWithLineItems } from "./invoiceMutations";
import { getEnrolmentBillingStatus, getWeeklyPaidThrough } from "./enrolmentBilling";
import { resolveWeeklyPayAheadSequence } from "@/server/invoicing/coverage";
import { normalizeOptionalDate } from "@/server/invoicing/dateUtils";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";

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
      template: { select: { id: true, dayOfWeek: true, name: true, levelId: true } },
      classAssignments: { include: { template: { select: { id: true, dayOfWeek: true, name: true, levelId: true } } } },
    },
  });

  if (!enrolment) throw new Error("Enrolment not found.");
  if (!enrolment.plan) throw new Error("Enrolment plan missing.");
  if (!enrolment.isBillingPrimary) {
    throw new Error("Secondary enrolments cannot be billed directly.");
  }
  if (!enrolment.template) throw new Error("Class template missing for enrolment.");
  assertPlanMatchesTemplate(enrolment.plan, enrolment.template);
  if (enrolment.plan.billingType !== BillingType.PER_WEEK) {
    throw new Error("Pay-ahead invoices are only supported for weekly plans.");
  }
  if (!enrolment.plan.durationWeeks) {
    throw new Error("Weekly plans require a duration in weeks.");
  }

  const billing = await getEnrolmentBillingStatus(enrolment.id, { client: prisma });

  const today = new Date();
  const paidThrough = billing.paidThroughDate ?? getWeeklyPaidThrough(enrolment);
  const enrolmentEnd = normalizeOptionalDate(enrolment.endDate);
  const assignedTemplates = enrolment.classAssignments.length
    ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
    : enrolment.template
      ? [enrolment.template]
      : [];
  const holidays: { startDate: Date; endDate: Date }[] = [];

  const payAhead = resolveWeeklyPayAheadSequence({
    startDate: enrolment.startDate,
    endDate: enrolmentEnd,
    paidThroughDate: paidThrough,
    durationWeeks: enrolment.plan.durationWeeks,
    sessionsPerWeek: enrolment.plan.sessionsPerWeek ?? null,
    quantity: periods,
    assignedTemplates,
    holidays,
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
