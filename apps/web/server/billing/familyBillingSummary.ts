import { BillingType } from "@prisma/client";

import { brisbaneCompare, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { calculateUnpaidBlocks } from "@/server/billing/familyBillingCalculations";

type EnrolmentSummaryInput = {
  id: string;
  studentId: string;
  planId: string | null;
  billingType: BillingType | null;
  planPriceCents: number;
  blockClassCount: number | null;
  sessionsPerWeek: number | null;
  paidThroughDate: Date | null;
  creditsRemaining: number | null;
};

type BillingBreakdownEntry = {
  enrolmentId: string;
  studentId: string;
  planId: string | null;
  planType: BillingType | null;
  paidThroughDayKey: string | null;
  overdueBlocks: number;
  overdueOwingCents: number;
};

export type FamilyBillingSummary = {
  overdueOwingCents: number;
  totalOwingCents: number;
  nextPaymentDueDayKey: string | null;
  breakdown: BillingBreakdownEntry[];
};

type ComputeParams = {
  enrolments: EnrolmentSummaryInput[];
  today: Date;
};

export function computeFamilyBillingSummary(params: ComputeParams): FamilyBillingSummary {
  const todayKey = toBrisbaneDayKey(brisbaneStartOfDay(params.today));

  let overdueOwingCents = 0;
  let nextPaymentDueDayKey: string | null = null;
  const breakdown: BillingBreakdownEntry[] = [];

  for (const enrolment of params.enrolments) {
    if (!enrolment.billingType) continue;
    const paidThroughDayKey = enrolment.paidThroughDate ? toBrisbaneDayKey(enrolment.paidThroughDate) : null;

    const overdueBlocks = calculateUnpaidBlocks({
      paidThroughDate: enrolment.paidThroughDate,
      sessionsPerWeek: enrolment.sessionsPerWeek,
      blockClassCount: enrolment.blockClassCount,
      today: params.today,
    });

    const overdueOwing = overdueBlocks * (enrolment.planPriceCents ?? 0);
    overdueOwingCents += overdueOwing;

    const candidateDueKey =
      paidThroughDayKey && brisbaneCompare(paidThroughDayKey, todayKey) >= 0 ? paidThroughDayKey : todayKey;
    if (!nextPaymentDueDayKey || brisbaneCompare(candidateDueKey, nextPaymentDueDayKey) < 0) {
      nextPaymentDueDayKey = candidateDueKey;
    }

    breakdown.push({
      enrolmentId: enrolment.id,
      studentId: enrolment.studentId,
      planId: enrolment.planId,
      planType: enrolment.billingType,
      paidThroughDayKey,
      overdueBlocks,
      overdueOwingCents: overdueOwing,
    });
  }

  return {
    overdueOwingCents,
    totalOwingCents: overdueOwingCents,
    nextPaymentDueDayKey,
    breakdown,
  };
}
