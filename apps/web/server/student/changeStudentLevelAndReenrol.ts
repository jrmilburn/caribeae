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
  initialAccountingForPlan,
  normalizePlan,
  normalizeStartDate,
  resolvePlannedEndDate,
} from "@/server/enrolment/planRules";
import { validateSelection } from "@/server/enrolment/validateSelection";
import { assertPlanMatchesTemplates } from "@/server/enrolment/planCompatibility";
import { createInitialInvoiceForEnrolment } from "@/server/invoicing";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";
import { createInvoiceWithLineItems, createPaymentAndAllocate } from "@/server/billing/invoiceMutations";

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

function computeWeeklyCredit(params: {
  enrolment: EnrolmentWithRelations;
  snapshot: Awaited<ReturnType<typeof getEnrolmentBillingStatus>>;
  effectiveDate: Date;
  invoice?: InvoiceWithCoverage | null;
}) {
  const paidThrough = params.snapshot.paidThroughDate ?? params.enrolment.paidThroughDate ?? null;
  if (!paidThrough || !params.enrolment.plan) return 0;

  const alignedPaidThrough = startOfDay(paidThrough);
  const boundary = startOfDay(params.effectiveDate);
  if (!isAfter(alignedPaidThrough, boundary)) return 0;

  const coverageStart = params.invoice?.coverageStart
    ? startOfDay(params.invoice.coverageStart)
    : startOfDay(params.enrolment.startDate);
  const coverageEnd = params.invoice?.coverageEnd
    ? startOfDay(params.invoice.coverageEnd)
    : alignedPaidThrough;

  if (!isAfter(coverageEnd, boundary)) return 0;
  const remainingDays = differenceInCalendarDays(coverageEnd, boundary);
  const totalDays = Math.max(differenceInCalendarDays(coverageEnd, coverageStart), 1);
  if (remainingDays <= 0 || totalDays <= 0) return 0;

  const paidBasis = Math.max(params.invoice?.amountPaidCents ?? params.invoice?.amountCents ?? 0, 0);
  if (paidBasis <= 0) return 0;

  return Math.floor((paidBasis / totalDays) * remainingDays);
}

function computeCreditForEnrolment(params: {
  enrolment: EnrolmentWithRelations;
  snapshot: Awaited<ReturnType<typeof getEnrolmentBillingStatus>>;
  effectiveDate: Date;
  invoice?: InvoiceWithCoverage | null;
}) {
  if (!params.enrolment.plan) return 0;
  if (params.enrolment.plan.billingType === BillingType.PER_WEEK) {
    return computeWeeklyCredit(params);
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
    if (plan.billingType === BillingType.PER_WEEK && templateIds.length !== 1) {
      throw new Error("Weekly plans support one anchor class for level changes.");
    }

    assertPlanMatchesTemplates(plan, templates);

    const normalizedPlan = normalizePlan(plan);
    if (plan.billingType !== BillingType.PER_WEEK) {
      const requiredCount = Math.max(1, normalizedPlan.sessionsPerWeek);
      if (templateIds.length !== requiredCount) {
        throw new Error(`Select ${requiredCount} classes for this plan.`);
      }
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

      const invoiceByEnrolment = new Map<string, InvoiceWithCoverage>();
            
      for (const inv of existingInvoices) {
        if (!inv.enrolmentId) continue; // <-- narrows to string
        if (!invoiceByEnrolment.has(inv.enrolmentId)) {
          invoiceByEnrolment.set(inv.enrolmentId, inv);
        }
      }


    let totalCreditCents = 0;
    for (const enrolment of existingEnrolments) {
      const snapshot = await getEnrolmentBillingStatus(enrolment.id, { client: tx, asOfDate: effectiveDate });
      const invoice = invoiceByEnrolment.get(enrolment.id) ?? null;
      totalCreditCents += computeCreditForEnrolment({
        enrolment,
        snapshot,
        effectiveDate,
        invoice,
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

    const enrolments: EnrolmentWithRelations[] = [];
    for (const template of templates) {
      const templateStart = startOfDay(template.startDate);
      const templateEnd = template.endDate ? startOfDay(template.endDate) : null;
      const startDate = isBefore(effectiveDate, templateStart) ? templateStart : effectiveDate;
      if (templateEnd && isAfter(startDate, templateEnd)) {
        throw new Error(`Start date is after the class ends for ${template.name ?? "class"}.`);
      }

      const endDate = resolvePlannedEndDate(plan, startDate, null, templateEnd);
      const accounting = initialAccountingForPlan(plan, startDate);
      const enrolment = await tx.enrolment.create({
        data: {
          templateId: template.id,
          studentId: input.studentId,
          startDate,
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
      await createInitialInvoiceForEnrolment(enrolment.id, { prismaClient: tx, skipAuth: true });
      enrolments.push(enrolment);
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
