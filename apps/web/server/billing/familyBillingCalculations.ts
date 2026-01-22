import { differenceInCalendarDays, isAfter } from "date-fns";
import { BillingType } from "@prisma/client";

import { brisbaneCompare, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

type OwingEnrolment = {
  billingType: BillingType | null;
  paidThroughDate: Date | null;
  planPriceCents: number | null;
  blockClassCount: number | null;
  sessionsPerWeek: number | null;
};

type UnpaidBlockInput = {
  paidThroughDate: Date | null;
  sessionsPerWeek: number | null;
  blockClassCount: number | null;
  today: Date;
};

function resolveClassesPerWeek(sessionsPerWeek: number | null) {
  return Math.max(sessionsPerWeek ?? 1, 1);
}

function resolveBlockSize(blockClassCount: number | null, sessionsPerWeek: number | null) {
  return Math.max(blockClassCount ?? resolveClassesPerWeek(sessionsPerWeek), 1);
}

export function calculateUnpaidBlocks(params: UnpaidBlockInput) {
  const today = brisbaneStartOfDay(params.today);
  if (!params.paidThroughDate) return 1;
  const paidThrough = brisbaneStartOfDay(params.paidThroughDate);
  if (!isAfter(today, paidThrough)) return 0;

  const daysBehind = differenceInCalendarDays(today, paidThrough);
  const classesPerWeek = resolveClassesPerWeek(params.sessionsPerWeek);
  const blockSize = resolveBlockSize(params.blockClassCount, params.sessionsPerWeek);
  const classesBehind = (daysBehind / 7) * classesPerWeek;
  return Math.max(1, Math.ceil(classesBehind / blockSize));
}

export function calculateAmountOwingCents(enrolments: OwingEnrolment[], todayInput: Date = new Date()) {
  const today = brisbaneStartOfDay(todayInput);
  return enrolments.reduce((sum, enrolment) => {
    if (!enrolment.billingType) return sum;
    const priceCents = enrolment.planPriceCents ?? 0;
    const unpaidBlocks = calculateUnpaidBlocks({
      paidThroughDate: enrolment.paidThroughDate,
      sessionsPerWeek: enrolment.sessionsPerWeek,
      blockClassCount: enrolment.blockClassCount,
      today,
    });
    return sum + unpaidBlocks * priceCents;
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
