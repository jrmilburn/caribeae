import type { HolidayRange } from "@/server/holiday/holidayUtils";
import type { PaidThroughTemplate } from "@/server/billing/paidThroughDate";
import { computeBlockCoverageRange } from "@/server/billing/paidThroughDate";

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
  assignedTemplates?: PaidThroughTemplate[];
  blocksPurchased: number;
  blockClassCount: number;
  creditsPurchased?: number;
  holidays: HolidayRange[];
};

export function computeBlockPayAheadCoverage(params: PayAheadCoverageParams): CoverageRange {
  const range = computeBlockCoverageRange({
    currentPaidThroughDate: params.currentPaidThroughDate,
    enrolmentStartDate: params.enrolmentStartDate,
    enrolmentEndDate: params.enrolmentEndDate ?? null,
    classTemplate: params.classTemplate,
    assignedTemplates: params.assignedTemplates,
    blockClassCount: params.blockClassCount,
    blocksPurchased: params.blocksPurchased,
    creditsPurchased: params.creditsPurchased,
    holidays: params.holidays,
  });

  return {
    coverageStart: range.coverageStart,
    coverageEnd: range.coverageEnd,
    creditsPurchased: range.creditsPurchased,
  };
}
