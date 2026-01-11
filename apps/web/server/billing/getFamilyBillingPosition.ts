"use server";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { differenceInCalendarDays, isAfter, startOfDay } from "date-fns";
import {
  BillingType,
  PaymentStatus,
  PrismaClient,
  type Prisma,
  type EnrolmentPlan,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getBillingStatusForEnrolments } from "@/server/billing/enrolmentBilling";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

function asDate(value?: Date | string | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

type EntitlementStatus = "AHEAD" | "DUE_SOON" | "OVERDUE" | "UNKNOWN";

function evaluateEntitlement(params: {
  billingType: BillingType | null | undefined;
  paidThroughDate: Date | null;
  creditsRemaining: number | null;
  thresholdCredits: number;
}) {
  /**
   * Status rules (kept deterministic and documented):
   * - Weekly plans rely on the enrolment.paidThroughDate field that is advanced when invoices are paid.
   *   - OVERDUE when missing OR the paid-through date is before today.
   *   - DUE_SOON when the paid-through date is within the next 14 days (inclusive).
   *   - AHEAD when the paid-through date is more than 14 days away.
   * - Credit-based plans rely on enrolment.creditsRemaining (includes adjustments and paid invoices).
   *   - OVERDUE when creditsRemaining <= 0.
   *   - DUE_SOON when creditsRemaining is positive but at or below one block’s worth of credits.
   *   - AHEAD when more than a block is available.
   */
  const today = startOfDay(new Date());

  if (params.billingType === BillingType.PER_WEEK) {
    const paidThrough = params.paidThroughDate ? startOfDay(params.paidThroughDate) : null;
    if (!paidThrough || isAfter(today, paidThrough)) return { status: "OVERDUE" as EntitlementStatus };
    const daysAhead = differenceInCalendarDays(paidThrough, today);
    if (daysAhead <= 14) return { status: "DUE_SOON" as EntitlementStatus };
    return { status: "AHEAD" as EntitlementStatus };
  }

  if (params.billingType === BillingType.PER_CLASS) {
    const paidThrough = params.paidThroughDate ? startOfDay(params.paidThroughDate) : null;
    if (paidThrough && !isAfter(today, paidThrough)) {
      const daysAhead = differenceInCalendarDays(paidThrough, today);
      if (daysAhead <= 14) return { status: "DUE_SOON" as EntitlementStatus };
      return { status: "AHEAD" as EntitlementStatus };
    }
    const credits = params.creditsRemaining ?? 0;
    if (credits <= 0) return { status: "OVERDUE" as EntitlementStatus };
    if (credits <= Math.max(params.thresholdCredits, 1)) return { status: "DUE_SOON" as EntitlementStatus };
    return { status: "AHEAD" as EntitlementStatus };
  }

  return { status: "UNKNOWN" as EntitlementStatus };
}

function blockSize(plan: EnrolmentPlan | null | undefined) {
  if (!plan) return 0;
  const size = plan.blockClassCount ?? 1;
  return size > 0 ? size : 0;
}

export async function getFamilyBillingPosition(familyId: string, options?: { client?: PrismaClientOrTx }) {
  await getOrCreateUser();
  await requireAdmin();

  const client = options?.client ?? prisma;

  const family = await client.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      name: true,
      primaryContactName: true,
      primaryPhone: true,
      students: {
        select: {
          id: true,
          name: true,
          enrolments: {
            include: {
              plan: true,
              template: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!family) throw new Error("Family not found.");

  const enrolmentIds = family.students.flatMap((s : any) => s.enrolments?.map((e : any) => e.id) ?? []);

  const [openInvoices, latestCoverage, paymentsAggregate, allocationsAggregate, payments, statusMap] = await Promise.all([
    client.invoice.findMany({
      where: { familyId, status: { in: [...OPEN_INVOICE_STATUSES] } },
      include: {
        enrolment: {
          include: {
            plan: true,
            student: { select: { name: true } },
          },
        },
      },
      orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }],
    }),
    enrolmentIds.length
      ? client.invoice.groupBy({
          by: ["enrolmentId"],
          where: { enrolmentId: { in: enrolmentIds }, coverageEnd: { not: null } },
          _max: { coverageEnd: true },
        })
      : Promise.resolve([]),
    client.payment.aggregate({
      where: { familyId, status: { not: PaymentStatus.VOID } },
      _sum: { amountCents: true },
    }),
    client.paymentAllocation.aggregate({
      where: { invoice: { familyId } },
      _sum: { amountCents: true },
    }),
    client.payment.findMany({
      where: { familyId, status: { not: PaymentStatus.VOID } },
      orderBy: { paidAt: "desc" },
      take: 5,
      include: {
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                status: true,
                amountCents: true,
                amountPaidCents: true,
                issuedAt: true,
              },
            },
          },
        },
      },
    }),
    getBillingStatusForEnrolments(enrolmentIds, { client }),
  ]);

  const latestCoverageMap = new Map<string, Date | null>(
    latestCoverage.map((entry : any) => [entry.enrolmentId, asDate(entry._max.coverageEnd)])
  );

  const openInvoicesWithBalance = openInvoices.map((invoice : any) => ({
    ...invoice,
    balanceCents: Math.max(invoice.amountCents - invoice.amountPaidCents, 0),
  }));

  const outstandingCents = openInvoicesWithBalance.reduce((sum : any, inv : any) => sum + inv.balanceCents, 0);
  const paidCents = paymentsAggregate._sum.amountCents ?? 0;
  const allocatedCents = allocationsAggregate._sum.amountCents ?? 0;
  const unallocatedCents = Math.max(paidCents - allocatedCents, 0);

  const students = family.students.map((student : any) => {
    const enrolments = (student.enrolments ?? []).filter((enrolment: any) => enrolment.status === "ACTIVE").map((enrolment : any) => {
      const plan = enrolment.plan ?? null;
      const snapshot = statusMap.get(enrolment.id);
      const paidThroughDate = snapshot?.paidThroughDate ?? asDate(enrolment.paidThroughDate);
      const creditsRemaining = snapshot?.remainingCredits ?? enrolment.creditsRemaining ?? 0;
      const latestCoverageEnd = latestCoverageMap.get(enrolment.id) ?? null;
      const projectedCoverageEnd = snapshot?.paidThroughDate ?? paidThroughDate ?? latestCoverageEnd;
      const thresholdCredits = blockSize(plan);

      const { status } = evaluateEntitlement({
        billingType: plan?.billingType ?? null,
        paidThroughDate,
        creditsRemaining,
        thresholdCredits,
      });

      return {
        id: enrolment.id,
        studentId: student.id,
        studentName: student.name,
        planId: enrolment.planId,
        planName: plan?.name ?? "Unassigned plan",
        billingType: plan?.billingType ?? null,
        planPriceCents: plan?.priceCents ?? 0,
        durationWeeks: plan?.durationWeeks ?? null,
        blockClassCount: plan?.blockClassCount ?? null,
        creditsRemaining,
        paidThroughDate,
        projectedCoverageEnd,
        startDate: asDate(enrolment.startDate),
        endDate: asDate(enrolment.endDate),
        templateName: enrolment.template?.name ?? null,
        status: enrolment.status,
        entitlementStatus: status as EntitlementStatus,
        latestCoverageEnd,
      };
    });

    return { id: student.id, name: student.name, enrolments };
  });

  const enrolmentsFlat = students.flatMap((s : any) => s.enrolments);
  const latestPaidThroughDates = enrolmentsFlat
    .map((e : any) => e.projectedCoverageEnd ?? e.paidThroughDate ?? e.latestCoverageEnd)
    .filter(Boolean) as Date[];
  const paidThroughLatest = latestPaidThroughDates.length
    ? latestPaidThroughDates.reduce((acc, curr) => (acc && acc > curr ? acc : curr))
    : null;

  const creditsTotal = enrolmentsFlat.reduce((sum : any, e : any) => sum + (e.creditsRemaining ?? 0), 0);

  const nextDueInvoice = [...openInvoicesWithBalance]
    .sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (a.status === "OVERDUE" && b.status !== "OVERDUE") return -1;
      if (b.status === "OVERDUE" && a.status !== "OVERDUE") return 1;
      return aDue - bDue;
    })
    .find((inv) => inv.balanceCents > 0);

  return {
    family: {
      id: family.id,
      name: family.name,
      primaryContactName: family.primaryContactName,
      primaryPhone: family.primaryPhone,
    },
    students,
    enrolments: enrolmentsFlat,
    openInvoices: openInvoicesWithBalance,
    outstandingCents,
    unallocatedCents,
    nextDueInvoice: nextDueInvoice
      ? {
          id: nextDueInvoice.id,
          dueAt: asDate(nextDueInvoice.dueAt),
          balanceCents: nextDueInvoice.balanceCents,
          status: nextDueInvoice.status,
        }
      : null,
    paidThroughLatest,
    creditsTotal,
    payments,
  };
}

export type FamilyBillingPosition = Awaited<ReturnType<typeof getFamilyBillingPosition>>;
