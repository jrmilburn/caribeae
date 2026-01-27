"use server";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { differenceInCalendarDays } from "date-fns";
import {
  BillingType,
  PaymentStatus,
  PrismaClient,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getBillingStatusForEnrolments } from "@/server/billing/enrolmentBilling";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { computeFamilyBillingSummary } from "@/server/billing/familyBillingSummary";
import { calculateUnpaidBlocks } from "@/server/billing/familyBillingCalculations";
import { enrolmentIsPayable } from "@/lib/enrolment/enrolmentVisibility";
import { filterWeeklyPlanOptions, resolveEnrolmentTemplates } from "@/server/billing/weeklyPlanSelection";

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
  sessionsPerWeek: number | null;
  blockClassCount: number | null;
}) {
  /**
   * Status rules (kept deterministic and documented):
   * - Weekly plans rely on the enrolment.paidThroughDate field that is advanced when invoices are paid.
   *   - OVERDUE when missing OR the paid-through date is before today.
   *   - DUE_SOON when the paid-through date is within the next 14 days (inclusive).
   *   - AHEAD when the paid-through date is more than 14 days away.
   * - Credit-based plans follow the same paid-through logic to match enrolment owing.
   */
  const today = brisbaneStartOfDay(new Date());

  if (!params.billingType) return { status: "UNKNOWN" as EntitlementStatus };

  const unpaidBlocks = calculateUnpaidBlocks({
    paidThroughDate: params.paidThroughDate,
    sessionsPerWeek: params.sessionsPerWeek,
    blockClassCount: params.blockClassCount,
    today,
  });
  if (unpaidBlocks > 0) return { status: "OVERDUE" as EntitlementStatus };

  const paidThrough = params.paidThroughDate ? brisbaneStartOfDay(params.paidThroughDate) : null;
  if (!paidThrough) return { status: "UNKNOWN" as EntitlementStatus };
  const daysAhead = differenceInCalendarDays(paidThrough, today);
  if (daysAhead <= 14) return { status: "DUE_SOON" as EntitlementStatus };
  return { status: "AHEAD" as EntitlementStatus };
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
            where: { isBillingPrimary: true },
            include: {
              plan: true,
              template: { select: { name: true } },
              classAssignments: {
                include: {
                  template: {
                    select: { name: true, dayOfWeek: true, startTime: true, endTime: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!family) throw new Error("Family not found.");

  const enrolmentIds = family.students.flatMap((s : any) => s.enrolments?.map((e : any) => e.id) ?? []);
  const levelIds = Array.from(
    new Set(
      family.students
        .flatMap((student) => student.enrolments?.map((enrolment) => enrolment.plan?.levelId).filter(Boolean) ?? [])
        .filter((levelId): levelId is string => Boolean(levelId))
    )
  );

  const [openInvoices, latestCoverage, paymentsAggregate, allocationsAggregate, payments, statusMap, holidays, weeklyPlans] = await Promise.all([
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
    client.holiday.findMany({ select: { startDate: true, endDate: true } }),
    levelIds.length
      ? client.enrolmentPlan.findMany({
          where: {
            levelId: { in: levelIds },
            billingType: BillingType.PER_WEEK,
          },
          select: {
            id: true,
            name: true,
            priceCents: true,
            durationWeeks: true,
            sessionsPerWeek: true,
            isSaturdayOnly: true,
            billingType: true,
            levelId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const weeklyPlansByLevel = weeklyPlans.reduce<Map<string, typeof weeklyPlans>>((map, plan) => {
    const entry = map.get(plan.levelId) ?? [];
    entry.push(plan);
    map.set(plan.levelId, entry);
    return map;
  }, new Map());

  const latestCoverageMap = new Map<string, Date | null>(
    latestCoverage.map((entry : any) => [entry.enrolmentId, asDate(entry._max.coverageEnd)])
  );

  const openInvoicesWithBalance = openInvoices.map((invoice : any) => ({
    ...invoice,
    balanceCents: Math.max(invoice.amountCents - invoice.amountPaidCents, 0),
  }));

  const openInvoiceBalanceCents = openInvoicesWithBalance.reduce(
    (sum: number, invoice: any) => sum + invoice.balanceCents,
    0
  );
  const paidCents = paymentsAggregate._sum.amountCents ?? 0;
  const allocatedCents = allocationsAggregate._sum.amountCents ?? 0;
  const unallocatedCents = Math.max(paidCents - allocatedCents, 0);

  const students = family.students.map((student : any) => {
    const enrolments = (student.enrolments ?? [])
      .filter((enrolment: any) =>
        enrolmentIsPayable({
          status: enrolment.status,
          paidThroughDate: asDate(enrolment.paidThroughDate),
          endDate: asDate(enrolment.endDate),
        })
      )
      .map((enrolment : any) => {
      const plan = enrolment.plan ?? null;
      const snapshot = statusMap.get(enrolment.id);
      const paidThroughDate = asDate(enrolment.paidThroughDate);
      const creditsRemaining = snapshot?.remainingCredits ?? enrolment.creditsRemaining ?? 0;
      const latestCoverageEnd = latestCoverageMap.get(enrolment.id) ?? null;
      const projectedCoverageEnd = paidThroughDate ?? snapshot?.paidThroughDate ?? latestCoverageEnd;
      const { status } = evaluateEntitlement({
        billingType: plan?.billingType ?? null,
        paidThroughDate,
        sessionsPerWeek: plan?.sessionsPerWeek ?? null,
        blockClassCount: plan?.blockClassCount ?? null,
      });

      const assignments = enrolment.classAssignments?.length
        ? enrolment.classAssignments
            .map((assignment : any) => assignment.template)
            .filter(Boolean)
        : enrolment.template
          ? [enrolment.template]
          : [];
      const templates = resolveEnrolmentTemplates({
        template: enrolment.template
          ? {
              dayOfWeek: enrolment.template.dayOfWeek ?? null,
              name: enrolment.template.name ?? null,
              levelId: enrolment.template.levelId ?? null,
            }
          : null,
        assignedTemplates: assignments.map((template: { dayOfWeek?: number | null; name?: string | null; levelId?: string | null }) => ({
          dayOfWeek: template?.dayOfWeek ?? null,
          name: template?.name ?? null,
          levelId: template?.levelId ?? null,
        })),
      });
      const currentLevelId = plan?.levelId ?? templates[0]?.levelId ?? null;
      const weeklyPlanOptions =
        plan?.billingType === BillingType.PER_WEEK
          ? filterWeeklyPlanOptions({
              plans: weeklyPlansByLevel.get(currentLevelId ?? "") ?? [],
              currentLevelId,
              templates,
            })
          : [];

      return {
        id: enrolment.id,
        studentId: student.id,
        studentName: student.name,
        planId: enrolment.planId,
        planName: plan?.name ?? "Unassigned plan",
        billingType: plan?.billingType ?? null,
        planPriceCents: plan?.priceCents ?? 0,
        durationWeeks: plan?.durationWeeks ?? null,
        sessionsPerWeek: plan?.sessionsPerWeek ?? null,
        blockClassCount: plan?.blockClassCount ?? null,
        weeklyPlanOptions,
        creditsRemaining,
        paidThroughDate,
        projectedCoverageEnd,
        startDate: asDate(enrolment.startDate),
        endDate: asDate(enrolment.endDate),
        templateName: enrolment.template?.name ?? null,
        assignedClasses: assignments.map((template : any) => ({
          name: template?.name ?? null,
          dayOfWeek: template?.dayOfWeek ?? null,
          startTime: template?.startTime ?? null,
          endTime: template?.endTime ?? null,
        })),
        status: enrolment.status,
        entitlementStatus: status as EntitlementStatus,
        latestCoverageEnd,
      };
    });

    return { id: student.id, name: student.name, enrolments };
  });

  const enrolmentsFlat = students.flatMap((s : any) => s.enrolments);
  const summary = computeFamilyBillingSummary({
    enrolments: enrolmentsFlat,
    today: new Date(),
  });
  const overallBalanceCents = summary.totalOwingCents + openInvoiceBalanceCents - unallocatedCents;
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
    openInvoiceBalanceCents,
    outstandingCents: summary.totalOwingCents,
    overallBalanceCents,
    unallocatedCents,
    nextDueInvoice: nextDueInvoice
      ? {
          id: nextDueInvoice.id,
          dueAt: asDate(nextDueInvoice.dueAt),
          balanceCents: nextDueInvoice.balanceCents,
          status: nextDueInvoice.status,
        }
      : null,
    nextPaymentDueDayKey: summary.nextPaymentDueDayKey,
    paidThroughLatest,
    creditsTotal,
    payments,
    holidays,
    breakdown: summary.breakdown,
  };
}

export type FamilyBillingPosition = Awaited<ReturnType<typeof getFamilyBillingPosition>>;
