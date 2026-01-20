import { differenceInCalendarDays, isAfter } from "date-fns";
import { BillingType } from "@prisma/client";

import { brisbaneCompare, brisbaneStartOfDay, fromBrisbaneDayKey, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

type EnrolmentSummaryInput = {
  id: string;
  studentId: string;
  planId: string | null;
  billingType: BillingType | null;
  planPriceCents: number;
  blockClassCount: number | null;
  paidThroughDate: Date | null;
  creditsRemaining: number | null;
};

type OpenInvoiceSummaryInput = {
  enrolmentId: string | null;
  balanceCents: number;
  coverageEnd: Date | null;
};

type BillingBreakdownEntry = {
  enrolmentId: string;
  studentId: string;
  planId: string | null;
  planType: BillingType | null;
  paidThroughDayKey: string | null;
  coveredThroughDayKey: string | null;
  overdueBlocks: number;
  overdueOwingCents: number;
  hasOpenInvoiceCoveringOverdue: boolean;
};

export type FamilyBillingSummary = {
  invoiceOwingCents: number;
  overdueOwingCents: number;
  totalOwingCents: number;
  nextPaymentDueDayKey: string | null;
  breakdown: BillingBreakdownEntry[];
};

type ComputeParams = {
  enrolments: EnrolmentSummaryInput[];
  openInvoices: OpenInvoiceSummaryInput[];
  today: Date;
};

function maxDayKey(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return brisbaneCompare(a, b) >= 0 ? a : b;
}

function computeWeeklyOverdueBlocks(coveredThroughDayKey: string | null, todayDayKey: string) {
  if (!coveredThroughDayKey) return 1;
  if (brisbaneCompare(coveredThroughDayKey, todayDayKey) >= 0) return 0;
  const coveredDate = fromBrisbaneDayKey(coveredThroughDayKey);
  const todayDate = fromBrisbaneDayKey(todayDayKey);
  const daysBehind = differenceInCalendarDays(todayDate, coveredDate);
  return Math.max(1, Math.ceil(daysBehind / 7));
}

function computeClassOverdueBlocks(creditsRemaining: number | null, blockClassCount: number | null) {
  const credits = creditsRemaining ?? 0;
  if (credits > 0) return 0;
  const blockSize = Math.max(blockClassCount ?? 1, 1);
  return Math.max(1, Math.ceil(-credits / blockSize));
}

export function computeFamilyBillingSummary(params: ComputeParams): FamilyBillingSummary {
  const todayKey = toBrisbaneDayKey(brisbaneStartOfDay(params.today));
  const invoiceOwingCents = params.openInvoices.reduce(
    (sum, invoice) => sum + Math.max(invoice.balanceCents ?? 0, 0),
    0
  );

  const coverageByEnrolment = new Map<string, string>();
  for (const invoice of params.openInvoices) {
    if (!invoice.enrolmentId || !invoice.coverageEnd || invoice.balanceCents <= 0) continue;
    const coverageKey = toBrisbaneDayKey(invoice.coverageEnd);
    const existing = coverageByEnrolment.get(invoice.enrolmentId) ?? null;
    coverageByEnrolment.set(invoice.enrolmentId, maxDayKey(existing, coverageKey) ?? coverageKey);
  }

  let overdueOwingCents = 0;
  let nextPaymentDueDayKey: string | null = null;
  const breakdown: BillingBreakdownEntry[] = [];

  for (const enrolment of params.enrolments) {
    const paidThroughDayKey = enrolment.paidThroughDate ? toBrisbaneDayKey(enrolment.paidThroughDate) : null;
    const invoiceCoveredThroughDayKey = coverageByEnrolment.get(enrolment.id) ?? null;
    const coveredThroughDayKey = maxDayKey(paidThroughDayKey, invoiceCoveredThroughDayKey);
    const hasOpenInvoiceCoveringOverdue =
      invoiceCoveredThroughDayKey != null && brisbaneCompare(invoiceCoveredThroughDayKey, todayKey) >= 0;

    let overdueBlocks = 0;
    if (!hasOpenInvoiceCoveringOverdue) {
      if (enrolment.billingType === BillingType.PER_WEEK) {
        overdueBlocks = computeWeeklyOverdueBlocks(coveredThroughDayKey, todayKey);
      } else if (enrolment.billingType === BillingType.PER_CLASS) {
        overdueBlocks = computeClassOverdueBlocks(enrolment.creditsRemaining, enrolment.blockClassCount);
      }
    }

    const overdueOwing = overdueBlocks * (enrolment.planPriceCents ?? 0);
    overdueOwingCents += overdueOwing;

    const candidateDueKey =
      coveredThroughDayKey && brisbaneCompare(coveredThroughDayKey, todayKey) >= 0 ? coveredThroughDayKey : todayKey;
    if (!nextPaymentDueDayKey || brisbaneCompare(candidateDueKey, nextPaymentDueDayKey) < 0) {
      nextPaymentDueDayKey = candidateDueKey;
    }

    breakdown.push({
      enrolmentId: enrolment.id,
      studentId: enrolment.studentId,
      planId: enrolment.planId,
      planType: enrolment.billingType,
      paidThroughDayKey,
      coveredThroughDayKey,
      overdueBlocks,
      overdueOwingCents: overdueOwing,
      hasOpenInvoiceCoveringOverdue,
    });
  }

  return {
    invoiceOwingCents,
    overdueOwingCents,
    totalOwingCents: invoiceOwingCents + overdueOwingCents,
    nextPaymentDueDayKey,
    breakdown,
  };
}
