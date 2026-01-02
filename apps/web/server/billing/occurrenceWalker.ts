import { addDays, isAfter, startOfDay } from "date-fns";

export type OccurrenceTemplate = {
  templateId: string;
  dayOfWeek: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
};

export type OccurrenceCancellation = { templateId: string; date: Date };

function dateKey(date: Date) {
  const d = startOfDay(date);
  return d.toISOString().slice(0, 10);
}

export function resolveOccurrenceHorizon(params: {
  startDate: Date;
  endDate?: Date | null;
  occurrencesNeeded: number;
  sessionsPerWeek: number;
  bufferWeeks?: number;
}) {
  const start = startOfDay(params.startDate);
  const cadence = Math.max(1, params.sessionsPerWeek || 1);
  const weeksToCover = Math.max(1, Math.ceil(Math.max(params.occurrencesNeeded, 1) / cadence));
  const bufferWeeks = params.bufferWeeks ?? 4;
  const projected = addDays(start, (weeksToCover + bufferWeeks) * 7);
  if (!params.endDate) return projected;
  const end = startOfDay(params.endDate);
  return isAfter(projected, end) ? end : projected;
}

export function buildOccurrenceSchedule(params: {
  startDate: Date;
  endDate?: Date | null;
  templates: OccurrenceTemplate[];
  cancellations: OccurrenceCancellation[];
  occurrencesNeeded: number;
  sessionsPerWeek: number;
  horizon?: Date | null;
  horizonBufferWeeks?: number;
}) {
  const start = startOfDay(params.startDate);
  const limit =
    params.horizon ??
    resolveOccurrenceHorizon({
      startDate: start,
      endDate: params.endDate,
      occurrencesNeeded: params.occurrencesNeeded,
      sessionsPerWeek: params.sessionsPerWeek,
      bufferWeeks: params.horizonBufferWeeks,
    });

  const cancelledSet = new Set(
    params.cancellations.map((c) => `${c.templateId}:${dateKey(c.date)}`)
  );

  const occurrences: Date[] = [];
  for (const template of params.templates) {
    const templateStart = template.startDate ? startOfDay(template.startDate) : start;
    const templateEnd = template.endDate ? startOfDay(template.endDate) : null;
    const windowStart = isAfter(start, templateStart) ? start : templateStart;
    const windowLimit =
      templateEnd && isAfter(limit, templateEnd) ? templateEnd : limit;

    if (templateEnd && isAfter(windowStart, templateEnd)) continue;

    let occurrence = nextOccurrenceOnOrAfter(windowStart, template.dayOfWeek) ?? windowStart;
    while (!isAfter(occurrence, windowLimit)) {
      const key = `${template.templateId}:${dateKey(occurrence)}`;
      if (!cancelledSet.has(key)) {
        occurrences.push(occurrence);
      }
      occurrence = addDays(occurrence, 7);
    }
  }

  occurrences.sort((a, b) => a.getTime() - b.getTime());
  return occurrences;
}

function nextOccurrenceOnOrAfter(start: Date, templateDayOfWeek: number | null | undefined) {
  if (templateDayOfWeek == null) return null;
  const target = ((templateDayOfWeek % 7) + 7) % 7; // 0 = Monday
  let cursor = startOfDay(start);
  while (cursor.getDay() !== ((target + 1) % 7)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

export function consumeOccurrencesForCredits(params: { occurrences: Date[]; credits: number }) {
  let remaining = params.credits;
  let paidThrough: Date | null = null;
  let nextDue: Date | null = null;
  let covered = 0;

  for (const occurrence of params.occurrences) {
    if (remaining <= 0) {
      nextDue = occurrence;
      break;
    }
    paidThrough = occurrence;
    covered += 1;
    remaining -= 1;
  }

  if (remaining <= 0 && !nextDue && params.occurrences.length > covered) {
    nextDue = params.occurrences[covered];
  }

  return { paidThrough, nextDue, remaining, covered };
}
