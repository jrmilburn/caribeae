import { addWeeks, isAfter, isBefore, max as maxDate } from "date-fns";
import { BillingType, type Prisma } from "@prisma/client";

import { normalizeDate, normalizeOptionalDate } from "@/server/invoicing/dateUtils";

export const enrolmentWithPlanInclude = {
  include: {
    plan: true,
    student: { select: { familyId: true } },
  },
} satisfies Prisma.EnrolmentInclude;

export function resolveWeeklyCoverageWindow(params: {
  enrolment: { startDate: Date; endDate: Date | null; paidThroughDate: Date | null };
  plan: { durationWeeks: number | null };
  today?: Date;
}) {
  const durationWeeks = params.plan.durationWeeks;
  if (!durationWeeks || durationWeeks <= 0) {
    throw new Error("Weekly plans require durationWeeks to be greater than zero.");
  }

  const startDate = normalizeDate(params.enrolment.startDate, "enrolment.startDate");
  const paidThrough = normalizeOptionalDate(params.enrolment.paidThroughDate);
  const today = normalizeDate(params.today ?? new Date(), "today");
  const enrolmentEnd = normalizeOptionalDate(params.enrolment.endDate);

  const coverageStart = paidThrough ? maxDate([today, paidThrough]) : maxDate([today, startDate]);

  if (enrolmentEnd && isAfter(coverageStart, enrolmentEnd)) {
    throw new Error("Enrolment end date has passed.");
  }

  let coverageEnd = addWeeks(coverageStart, durationWeeks);
  if (enrolmentEnd && isAfter(coverageEnd, enrolmentEnd)) {
    coverageEnd = enrolmentEnd;
  }

  return {
    coverageStart: normalizeDate(coverageStart),
    coverageEnd: normalizeDate(coverageEnd),
  };
}

export function resolveWeeklyPayAheadSequence(params: {
  startDate: Date;
  endDate: Date | null;
  paidThroughDate: Date | null;
  durationWeeks: number;
  quantity: number;
  today?: Date;
}) {
  if (!params.durationWeeks || params.durationWeeks <= 0) {
    throw new Error("Weekly plans require durationWeeks to be greater than zero.");
  }
  if (params.quantity <= 0) {
    return { coverageStart: null as Date | null, coverageEnd: null as Date | null, periods: 0 };
  }

  const today = normalizeDate(params.today ?? new Date(), "today");
  const endDate = normalizeOptionalDate(params.endDate);
  const baseline = normalizeDate(params.paidThroughDate ?? params.startDate, "paidThroughDate");
  const firstCoverageStart = maxDate([today, baseline]);

  if (endDate && (isAfter(firstCoverageStart, endDate) || firstCoverageStart.getTime() === endDate.getTime())) {
    return { coverageStart: null, coverageEnd: null, periods: 0 };
  }

  let currentStart = firstCoverageStart;
  const coverageStart = firstCoverageStart;
  let coverageEnd = firstCoverageStart;
  let periods = 0;

  for (let i = 0; i < params.quantity; i++) {
    if (endDate && isAfter(currentStart, endDate)) break;
    const rawEnd = addWeeks(currentStart, params.durationWeeks);
    coverageEnd = endDate && isAfter(rawEnd, endDate) ? endDate : rawEnd;
    currentStart = coverageEnd;
    periods += 1;
  }

  return {
    coverageStart: periods > 0 ? normalizeDate(coverageStart) : null,
    coverageEnd: periods > 0 ? normalizeDate(coverageEnd) : null,
    periods,
  };
}

export function resolveCoverageForPlan(params: {
  enrolment: Prisma.EnrolmentGetPayload<typeof enrolmentWithPlanInclude>;
  plan: Prisma.EnrolmentPlanUncheckedCreateInput | Prisma.EnrolmentPlanGetPayload<{ include: { level: true } }>;
  today?: Date;
}) {
  const { enrolment, plan } = params;
  const today = params.today ?? new Date();

  if (plan.billingType === BillingType.PER_WEEK) {
    const { coverageStart, coverageEnd } = resolveWeeklyCoverageWindow({
      enrolment: {
        startDate: enrolment.startDate,
        endDate: enrolment.endDate,
        paidThroughDate: enrolment.paidThroughDate,
      },
      plan: { durationWeeks: plan.durationWeeks ?? null },
      today,
    });
    return { coverageStart, coverageEnd, creditsPurchased: null };
  }

  const creditsPurchased = plan.blockClassCount ?? 1;
  if (plan.blockClassCount != null && plan.blockClassCount <= 0) {
    throw new Error("PER_CLASS plans with blockClassCount must be > 0.");
  }
  return { coverageStart: null, coverageEnd: null, creditsPurchased };
}
