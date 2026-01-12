"use server";

import { revalidatePath } from "next/cache";
import { addDays, isAfter, isBefore, startOfDay } from "date-fns";
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
import { createInvoiceWithLineItems, createPaymentAndAllocate } from "@/server/billing/invoiceMutations";
import { listScheduledOccurrences } from "@/server/billing/paidThroughDate";

type ChangeStudentLevelInput = {
  studentId: string;
  toLevelId: string;
  effectiveDate: string;
  templateIds: string[];
  planId: string;
  note?: string | null;
};

type EnrolmentWithRelations = Prisma.EnrolmentGetPayload<{
  include: { plan: true; template: true };
}>;

type InvoiceWithCoverage = Prisma.InvoiceGetPayload<{
  select: {
    id: true;
    enrolmentId: true;
    amountCents: true;
    amountPaidCents: true;
    status: true;
    coverageStart: true;
    coverageEnd: true;
  };
}>;

async function computeWeeklyCredit(params: {
  enrolment: EnrolmentWithRelations;
  effectiveDate: Date;
  invoice?: InvoiceWithCoverage | null;
  client: Prisma.TransactionClient;
}) {
  if (!params.enrolment.plan || !params.enrolment.template || !params.invoice) return 0;
  const coverageStart = params.invoice.coverageStart ? startOfDay(params.invoice.coverageStart) : null;
  const coverageEnd = params.invoice.coverageEnd ? startOfDay(params.invoice.coverageEnd) : null;
  if (!coverageStart || !coverageEnd) return 0;

  const boundary = startOfDay(params.effectiveDate);
  if (isBefore(coverageEnd, boundary)) return 0;

  const holidays = await params.client.holiday.findMany({
    where: {
      startDate: { lte: coverageEnd },
      endDate: { gte: coverageStart },
    },
    orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
  });

  const cancellations = await params.client.classCancellation.findMany({
    where: {
      templateId: params.enrolment.template.id,
      date: { gte: coverageStart, lte: coverageEnd },
    },
    select: { date: true },
  });

  const occurrences = listScheduledOccurrences({
    startDate: coverageStart,
    endDate: coverageEnd,
    classTemplate: { dayOfWeek: params.enrolment.template.dayOfWeek },
    holidays,
    cancellations: cancellations.map((c) => c.date),
  });

  const totalLessons = occurrences.length;
  if (totalLessons <= 0) return 0;

  const lessonsCompleted = occurrences.filter((date) => isBefore(date, boundary)).length;
  const remainingLessons = Math.max(totalLessons - lessonsCompleted, 0);
  if (remainingLessons <= 0) return 0;

  const paidBasis = Math.max(params.invoice?.amountPaidCents ?? params.invoice?.amountCents ?? 0, 0);
  if (paidBasis <= 0) return 0;

  return Math.round((paidBasis / totalLessons) * remainingLessons);
}

async function computeCreditForEnrolment(params: {
  enrolment: EnrolmentWithRelations;
  snapshot: Awaited<ReturnType<typeof getEnrolmentBillingStatus>>;
  effectiveDate: Date;
  invoice?: InvoiceWithCoverage | null;
  client: Prisma.TransactionClient;
}) {
  if (!params.enrolment.plan) return 0;
  if (params.enrolment.plan.billingType === BillingType.PER_WEEK) {
    return computeWeeklyCredit({
      enrolment: params.enrolment,
      effectiveDate: params.effectiveDate,
      invoice: params.invoice,
      client: params.client,
    });
  }

  const remainingCredits = params.snapshot.remainingCredits ?? params.enrolment.creditsRemaining ?? 0;
  if (!remainingCredits || remainingCredits <= 0) return 0;
  const blockSize = params.enrolment.plan.blockClassCount && params.enrolment.plan.blockClassCount > 0
    ? params.enrolment.plan.blockClassCount
    : 1;
  const perCredit = params.enrolment.plan.priceCents / blockSize;
  return Math.round(remainingCredits * perCredit);
}

export async function changeStudentLevelAndReenrol(input: ChangeStudentLevelInput) {
  const user = await getOrCreateUser();
  await requireAdmin();

  if (!input.templateIds.length) {
    throw new Error("Select at least one class template.");
  }

  const templateIds = Array.from(new Set(input.templateIds));
  const effectiveDate = normalizeStartDate(input.effectiveDate);

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

    const existingEnrolments = await tx.enrolment.findMany({
      where: {
        studentId: input.studentId,
        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] },
      },
      include: { plan: true, template: true },
    });

    const existingInvoices = existingEnrolments.length
      ? await tx.invoice.findMany({
          where: {
            enrolmentId: { in: existingEnrolments.map((e) => e.id) },
            status: { not: InvoiceStatus.VOID },
          },
          select: {
            id: true,
            enrolmentId: true,
            amountCents: true,
            amountPaidCents: true,
            status: true,
            coverageStart: true,
            coverageEnd: true,
          },
          orderBy: [{ issuedAt: "desc" }],
        })
      : [];

    const invoiceByEnrolment = new Map<string, InvoiceWithCoverage | null>();
    existingInvoices.forEach((inv) => {
      if (!inv.enrolmentId) return;
      const existing = invoiceByEnrolment.get(inv.enrolmentId);
      if (!existing) {
        invoiceByEnrolment.set(inv.enrolmentId, inv);
      }
    });

    let totalCreditCents = 0;
    for (const enrolment of existingEnrolments) {
      const snapshot = await getEnrolmentBillingStatus(enrolment.id, { client: tx, asOfDate: effectiveDate });
      const invoice = invoiceByEnrolment.get(enrolment.id) ?? null;
      totalCreditCents += await computeCreditForEnrolment({
        enrolment,
        snapshot,
        effectiveDate,
        invoice,
        client: tx,
      });
    }

    const endBoundary = addDays(effectiveDate, -1);
    for (const enrolment of existingEnrolments) {
      const alignedEnd = isBefore(endBoundary, startOfDay(enrolment.startDate))
        ? startOfDay(enrolment.startDate)
        : endBoundary;
      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: {
          endDate: alignedEnd,
          status: EnrolmentStatus.CANCELLED,
          cancelledAt: enrolment.cancelledAt ?? new Date(),
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

    const windows = templates.map((template) => {
      const templateStart = startOfDay(template.startDate);
      const templateEnd = template.endDate ? startOfDay(template.endDate) : null;
      const startDate = isBefore(effectiveDate, templateStart) ? templateStart : effectiveDate;
      if (templateEnd && isAfter(startDate, templateEnd)) {
        throw new Error(`Start date is after the class ends for ${template.name ?? "class"}.`);
      }
      return { templateId: template.id, startDate, endDate: templateEnd };
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

    const enrolment = await tx.enrolment.create({
      data: {
        templateId: anchorTemplate?.id ?? templates[0]?.id ?? "",
        studentId: input.studentId,
        startDate: earliestStart,
        endDate,
        status: EnrolmentStatus.ACTIVE,
        planId: plan.id,
        paidThroughDate: accounting.paidThroughDate,
        creditsRemaining: accounting.creditsRemaining,
        creditsBalanceCached: accounting.creditsRemaining ?? null,
        paidThroughDateComputed: accounting.paidThroughDate ?? null,
      },
      include: { plan: true, template: true },
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
    await recomputeEnrolmentComputedFields(enrolment.id, { client: tx });

    const enrolments: EnrolmentWithRelations[] = [enrolment];

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

    const creditInvoice =
      totalCreditCents > 0
        ? await createInvoiceWithLineItems({
            familyId: student.familyId,
            lineItems: [
              {
                kind: InvoiceLineItemKind.ADJUSTMENT,
                description: "Credit for unused enrolment after level change",
                quantity: 1,
                amountCents: -totalCreditCents,
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
    if (totalCreditCents > 0 && outstandingTargets.length) {
      let remainingCredit = totalCreditCents;
      for (const target of outstandingTargets) {
        if (remainingCredit <= 0) break;
        const applied = Math.min(target.remaining, remainingCredit);
        creditAllocations.push({ invoiceId: target.invoiceId, amountCents: applied });
        remainingCredit -= applied;
      }
    }

    const payment =
      creditAllocations.length > 0
        ? await createPaymentAndAllocate({
            familyId: student.familyId,
            amountCents: creditAllocations.reduce((sum, a) => sum + a.amountCents, 0),
            method: "credit",
            note: "Auto-applied credit for level change",
            allocations: creditAllocations,
            client: tx,
            skipAuth: true,
          })
        : null;

    return {
      levelChangeId: levelChange.id,
      enrolmentIds: enrolments.map((e) => e.id),
      creditInvoiceId: creditInvoice?.id ?? null,
      paymentId: payment?.payment.id ?? null,
      familyId: student.familyId,
    };
  });

  revalidatePath(`/admin/family/${result.familyId}`);
  revalidatePath(`/admin/student/${input.studentId}`);
  revalidatePath("/admin/enrolment");
  templateIds.forEach((id) => revalidatePath(`/admin/class/${id}`));

  return result;
}
