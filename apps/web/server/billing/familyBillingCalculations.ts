import { differenceInCalendarDays, isAfter } from "date-fns";
import { BillingType } from "@prisma/client";

import { brisbaneCompare, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

type OwingEnrolment = {
  billingType: BillingType | null;
  paidThroughDate: Date | null;
  creditsRemaining: number | null;
  planPriceCents: number | null;
  blockClassCount: number | null;
};

function calculateWeeklyOwingCents(paidThroughDate: Date | null, priceCents: number, today: Date) {
  if (!paidThroughDate || priceCents <= 0) return 0;
  const paidThrough = brisbaneStartOfDay(paidThroughDate);
  if (!isAfter(today, paidThrough)) return 0;
  const daysBehind = differenceInCalendarDays(today, paidThrough);
  const weeksBehind = Math.ceil(daysBehind / 7);
  return weeksBehind * priceCents;
}

function calculateBlockOwingCents(creditsRemaining: number | null, priceCents: number, blockClassCount: number | null) {
  if (priceCents <= 0) return 0;
  const credits = creditsRemaining ?? 0;
  if (credits > 0) return 0;
  const blockSize = Math.max(blockClassCount ?? 1, 1);
  const blocksBehind = Math.max(1, Math.ceil(-credits / blockSize));
  return blocksBehind * priceCents;
}

export function calculateAmountOwingCents(enrolments: OwingEnrolment[], todayInput: Date = new Date()) {
  const today = brisbaneStartOfDay(todayInput);
  return enrolments.reduce((sum, enrolment) => {
    const priceCents = enrolment.planPriceCents ?? 0;
    if (enrolment.billingType === BillingType.PER_WEEK) {
      return sum + calculateWeeklyOwingCents(enrolment.paidThroughDate, priceCents, today);
    }
    if (enrolment.billingType === BillingType.PER_CLASS) {
      return sum + calculateBlockOwingCents(enrolment.creditsRemaining, priceCents, enrolment.blockClassCount);
    }
    return sum;
  }, 0);
}

export function calculateNextPaymentDueDayKey(
  enrolments: Array<Pick<OwingEnrolment, "paidThroughDate">>,
  todayInput: Date = new Date()
) {
  const today = brisbaneStartOfDay(todayInput);
  let earliestKey: string | null = null;

  for (const enrolment of enrolments) {
    if (!enrolment.paidThroughDate) continue;
    const paidThrough = brisbaneStartOfDay(enrolment.paidThroughDate);
    const candidate = isAfter(today, paidThrough) ? today : paidThrough;
    const candidateKey = toBrisbaneDayKey(candidate);
    if (!earliestKey || brisbaneCompare(candidateKey, earliestKey) < 0) {
      earliestKey = candidateKey;
    }
  }

  return earliestKey;
}
