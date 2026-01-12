import { addDays } from "date-fns";

import type { HolidayRange } from "@/server/holiday/holidayUtils";
import type { PaidThroughTemplate } from "@/server/billing/paidThroughDate";
import { calculatePaidThroughDate } from "@/server/billing/paidThroughDate";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

type CoverageRange = {
  coverageStart: Date | null;
  coverageEnd: Date | null;
  creditsPurchased: number;
};

type PayAheadCoverageParams = {
  currentPaidThroughDate?: Date | null;
  enrolmentStartDate: Date;
  enrolmentEndDate?: Date | null;
  classTemplate: PaidThroughTemplate;
  blocksPurchased: number;
  blockClassCount: number;
  holidays: HolidayRange[];
};

function normalizeBrisbaneDate(value: Date) {
  return brisbaneStartOfDay(value);
}

function resolveNextCoverageStart(params: {
  startDate: Date;
  endDate?: Date | null;
  classTemplate: PaidThroughTemplate;
  holidays: HolidayRange[];
}) {
  const next = calculatePaidThroughDate({
    startDate: normalizeBrisbaneDate(params.startDate),
    endDate: params.endDate ? normalizeBrisbaneDate(params.endDate) : null,
    creditsToCover: 0,
    classTemplate: params.classTemplate,
    holidays: params.holidays,
    cancellations: [],
  });
  return next.nextDueDate ?? null;
}

export function computeBlockPayAheadCoverage(params: PayAheadCoverageParams): CoverageRange {
  const creditsPurchased = Math.max(params.blockClassCount, 1) * Math.max(params.blocksPurchased, 0);
  if (!creditsPurchased) {
    return { coverageStart: null, coverageEnd: null, creditsPurchased: 0 };
  }

  const baseDate = params.currentPaidThroughDate
    ? addDays(normalizeBrisbaneDate(params.currentPaidThroughDate), 1)
    : normalizeBrisbaneDate(params.enrolmentStartDate);

  const coverageStart = resolveNextCoverageStart({
    startDate: baseDate,
    endDate: params.enrolmentEndDate ?? null,
    classTemplate: params.classTemplate,
    holidays: params.holidays,
  });

  if (!coverageStart) {
    return { coverageStart: null, coverageEnd: null, creditsPurchased };
  }

  const projection = calculatePaidThroughDate({
    startDate: coverageStart,
    endDate: params.enrolmentEndDate ?? null,
    creditsToCover: creditsPurchased,
    classTemplate: params.classTemplate,
    holidays: params.holidays,
    cancellations: [],
  });

  return {
    coverageStart,
    coverageEnd: projection.paidThroughDate ?? null,
    creditsPurchased,
  };
}
