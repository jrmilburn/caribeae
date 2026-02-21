import { addDays, differenceInCalendarDays, isAfter, isBefore } from "date-fns";

import { buildMissedOccurrencePredicate } from "@/server/billing/missedOccurrence";
import { buildOccurrenceSchedule, resolveOccurrenceHorizon } from "@/server/billing/occurrenceWalker";
import { brisbaneAddDays, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

export type AwayMathTemplate = {
  id: string;
  dayOfWeek: number | null;
  startDate: Date;
  endDate: Date | null;
  levelId: string | null;
};

export type AwayMathCoverage = {
  holidays: Array<{ startDate: Date; endDate: Date; levelId: string | null; templateId: string | null }>;
  cancellationCredits: Array<{ templateId: string; date: Date }>;
};

function toOccurrenceDate(value: Date) {
  const dayKey = toBrisbaneDayKey(value);
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function overlapsRange(startDayKey: string, endDayKey: string, rangeStartDayKey: string, rangeEndDayKey: string) {
  return startDayKey <= rangeEndDayKey && endDayKey >= rangeStartDayKey;
}

function sliceCoverageByRange(coverage: AwayMathCoverage, rangeStart: Date, rangeEnd: Date): AwayMathCoverage {
  const rangeStartKey = toBrisbaneDayKey(rangeStart);
  const rangeEndKey = toBrisbaneDayKey(rangeEnd);

  return {
    holidays: coverage.holidays.filter((holiday) => {
      const startDayKey = toBrisbaneDayKey(holiday.startDate);
      const endDayKey = toBrisbaneDayKey(holiday.endDate);
      return overlapsRange(startDayKey, endDayKey, rangeStartKey, rangeEndKey);
    }),
    cancellationCredits: coverage.cancellationCredits.filter((credit) => {
      const dayKey = toBrisbaneDayKey(credit.date);
      return dayKey >= rangeStartKey && dayKey <= rangeEndKey;
    }),
  };
}

export function resolveSessionsPerWeek(templates: AwayMathTemplate[]) {
  const scheduled = templates.filter((template) => template.dayOfWeek !== null).length;
  return Math.max(1, scheduled);
}

export function applyAwayDeltaDays(baseDate: Date, deltaDays: number) {
  const baseKey = toBrisbaneDayKey(brisbaneStartOfDay(baseDate));
  return brisbaneStartOfDay(brisbaneAddDays(baseKey, deltaDays));
}

export function listAwayOccurrences(params: {
  templates: AwayMathTemplate[];
  startDate: Date;
  endDate: Date | null;
  horizon: Date;
  sessionsPerWeek: number;
  coverage: AwayMathCoverage;
}) {
  const startDate = toOccurrenceDate(params.startDate);
  const endDate = params.endDate ? toOccurrenceDate(params.endDate) : null;
  const horizon = toOccurrenceDate(params.horizon);

  const templatesById = new Map(
    params.templates.map((template) => [template.id, { id: template.id, levelId: template.levelId }])
  );

  const missedPredicate = buildMissedOccurrencePredicate({
    templatesById,
    holidays: params.coverage.holidays,
    cancellationCredits: params.coverage.cancellationCredits,
  });

  return buildOccurrenceSchedule({
    startDate,
    endDate,
    templates: params.templates.map((template) => ({
      templateId: template.id,
      dayOfWeek: template.dayOfWeek,
      startDate: toOccurrenceDate(template.startDate),
      endDate: template.endDate ? toOccurrenceDate(template.endDate) : null,
    })),
    cancellations: [],
    occurrencesNeeded: 1,
    sessionsPerWeek: params.sessionsPerWeek,
    horizon,
    shouldSkipOccurrence: ({ templateId, date }) => missedPredicate(templateId, toBrisbaneDayKey(date)),
  });
}

export function calculateAwayDeltaDays(params: {
  currentPaidThroughDate: Date;
  missedOccurrences: number;
  sessionsPerWeek: number;
  templates: AwayMathTemplate[];
  enrolmentEndDate: Date | null;
  coverage: AwayMathCoverage;
}) {
  if (params.missedOccurrences <= 0) return 0;

  if (params.sessionsPerWeek <= 1) {
    return params.missedOccurrences * 7;
  }

  const extensionStart = toOccurrenceDate(addDays(params.currentPaidThroughDate, 1));
  const enrolmentEndDate = params.enrolmentEndDate ? toOccurrenceDate(params.enrolmentEndDate) : null;

  if (enrolmentEndDate && isAfter(extensionStart, enrolmentEndDate)) {
    return 0;
  }

  let horizon = resolveOccurrenceHorizon({
    startDate: extensionStart,
    endDate: enrolmentEndDate,
    occurrencesNeeded: params.missedOccurrences,
    sessionsPerWeek: params.sessionsPerWeek,
  });

  let futureOccurrences: Date[] = [];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const boundedHorizon =
      enrolmentEndDate && isAfter(horizon, enrolmentEndDate)
        ? enrolmentEndDate
        : horizon;

    const coverageForRange = sliceCoverageByRange(params.coverage, extensionStart, boundedHorizon);

    futureOccurrences = listAwayOccurrences({
      templates: params.templates,
      startDate: extensionStart,
      endDate: enrolmentEndDate,
      horizon: boundedHorizon,
      sessionsPerWeek: params.sessionsPerWeek,
      coverage: coverageForRange,
    });

    if (futureOccurrences.length >= params.missedOccurrences) break;
    if (enrolmentEndDate && !isBefore(boundedHorizon, enrolmentEndDate)) break;

    horizon = addDays(boundedHorizon, 28);
  }

  const targetIndex = Math.min(params.missedOccurrences, futureOccurrences.length) - 1;
  const targetOccurrence = targetIndex >= 0 ? futureOccurrences[targetIndex] : null;
  if (!targetOccurrence) return 0;

  return Math.max(
    0,
    differenceInCalendarDays(brisbaneStartOfDay(targetOccurrence), brisbaneStartOfDay(params.currentPaidThroughDate))
  );
}
