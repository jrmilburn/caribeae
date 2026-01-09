import { addDays, addMinutes, format, getISODay, isValid, parse, parseISO } from "date-fns";
import type { Prisma } from "@prisma/client";

export type DateParam = Date | string | null | undefined;

export type NormalizedDateRange = {
  from: Date;
  to: Date;
};

export type TemplateWithTiming = {
  startTime: number | null | undefined;
  endTime: number | null | undefined;
  level?: { defaultLengthMin: number | null | undefined; defaultCapacity?: number | null };
};

export type TemplateWithRelations = Prisma.ClassTemplateGetPayload<{ include: { level: true; teacher: true } }>;

export type TemplateOccurrence = {
  id: string;
  templateId: string;
  templateName?: string | null;
  dayOfWeek: number; // 0-6 (Mon-Sun)
  startTime: Date;
  endTime: Date;
  capacity?: number | null;
  level?: TemplateWithRelations["level"];
  levelId?: string;
  teacher?: TemplateWithRelations["teacher"];
  teacherId?: string | null;
  template: TemplateWithRelations;
  cancelled?: boolean;
  cancellationReason?: string | null;
};

export const SCHEDULE_TIME_ZONE = "Australia/Brisbane";

type TimeZoneDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getTimeZoneDateParts(date: Date, timeZone: string = SCHEDULE_TIME_ZONE): TimeZoneDateParts {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, number>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = Number(part.value);
    }
    return acc;
  }, {});

  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function getTimeZoneOffset(date: Date, timeZone: string = SCHEDULE_TIME_ZONE): number {
  const parts = getTimeZoneDateParts(date, timeZone);
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUTC - date.getTime();
}

export function safeParseDateParam(value: DateParam): Date | null {
  if (!value) return null;

  const parsed =
    value instanceof Date
      ? value
      : parse(value, "yyyy-MM-dd", new Date());

  if (isValid(parsed)) return dateAtMinutesLocal(parsed, 0);

  const fallback = value instanceof Date ? value : parseISO(value);
  if (!fallback || !isValid(fallback)) return null;
  return dateAtMinutesLocal(fallback, 0);
}

export function formatAsDateParam(value: Date): string {
  return format(dateAtMinutesLocal(value, 0), "yyyy-MM-dd");
}

export function normalizeDateRange(params: {
  from?: DateParam;
  to?: DateParam;
  defaultFrom?: Date;
  defaultTo?: Date;
}): NormalizedDateRange {
  const baseFrom = params.from ?? params.defaultFrom ?? new Date();
  const baseTo = params.to ?? params.defaultTo ?? baseFrom;

  const normalizedFrom = dateAtMinutesLocal(asDate(baseFrom), 0);
  const normalizedTo = dateAtMinutesLocal(asDate(baseTo), (24 * 60) - 1);

  if (normalizedTo.getTime() < normalizedFrom.getTime()) {
    throw new Error("Range end must be on or after range start");
  }

  return { from: normalizedFrom, to: normalizedTo };
}

function asDate(value: DateParam): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parse(value, "yyyy-MM-dd", new Date());
    if (isValid(parsed)) return dateAtMinutesLocal(parsed, 0);
    throw new Error("Invalid date");
  }

  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    const fallback = parse(value, "yyyy-MM-dd", new Date());
    if (isValid(fallback)) return dateAtMinutesLocal(fallback, 0);
    throw new Error("Invalid date");
  }
  return parsed;
}

export function dateAtMinutesLocal(day: Date, minutes: number, timeZone: string = SCHEDULE_TIME_ZONE): Date {
  const parts = getTimeZoneDateParts(day, timeZone);
  const utcTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day, 0, minutes, 0, 0);
  const offset = getTimeZoneOffset(new Date(utcTimestamp), timeZone);
  return new Date(utcTimestamp - offset);
}

export function getLocalTimeInfo(date: Date, timeZone: string = SCHEDULE_TIME_ZONE) {
  const parts = getTimeZoneDateParts(date, timeZone);
  const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay(); // 0=Sun
  const minutesSinceMidnight = parts.hour * 60 + parts.minute;
  return { parts, dayOfWeek, minutesSinceMidnight };
}

export function resolveTemplateDurationMinutes(template: TemplateWithTiming): number {
  const start = template.startTime;
  const end = template.endTime;
  if (typeof start === "number" && typeof end === "number" && end > start) {
    return end - start;
  }

  const levelDefault = template.level?.defaultLengthMin;
  if (typeof levelDefault === "number" && levelDefault > 0) return levelDefault;

  return 45;
}

export function expandTemplatesToOccurrences(
  templates: TemplateWithRelations[],
  range: NormalizedDateRange
): TemplateOccurrence[] {
  return templates.flatMap((template) => {
    if (template.dayOfWeek === null || template.dayOfWeek === undefined) return [];
    if (template.startTime === null || template.startTime === undefined) return [];

    const rangeStart = dateAtMinutesLocal(range.from, 0);
    const rangeEnd = dateAtMinutesLocal(range.to, (24 * 60) - 1);
    const templateStart = dateAtMinutesLocal(template.startDate, 0);
    const templateEnd = template.endDate ? dateAtMinutesLocal(template.endDate, (24 * 60) - 1) : null;

    if (templateEnd && templateEnd < rangeStart) return [];
    if (templateStart > rangeEnd) return [];

    const targetIsoDay = template.dayOfWeek === 6 ? 7 : template.dayOfWeek + 1; // Prisma comment: 0=Mon..6=Sun
    let cursor = dateAtMinutesLocal(rangeStart, 0);
    const rangeIso = getISODay(cursor);
    const daysUntilTarget = (targetIsoDay - rangeIso + 7) % 7;
    cursor = addDays(cursor, daysUntilTarget);

    while (cursor < templateStart) {
      cursor = addDays(cursor, 7);
    }

    const durationMin = resolveTemplateDurationMinutes(template);
    if (durationMin <= 0) return [];

    const occurrences: TemplateOccurrence[] = [];

    while (cursor <= rangeEnd) {
      if (templateEnd && cursor > templateEnd) break;

      const startTime = dateAtMinutesLocal(cursor, template.startTime ?? 0);
      const endTime = dateAtMinutesLocal(cursor, (template.startTime ?? 0) + durationMin);

      occurrences.push({
        id: `${template.id}-${format(cursor, "yyyy-MM-dd")}`,
        templateId: template.id,
        templateName: template.name,
        dayOfWeek: template.dayOfWeek,
        startTime,
        endTime,
        capacity: template.capacity ?? template.level?.defaultCapacity ?? null,
        level: template.level,
        levelId: template.levelId,
        teacher: template.teacher,
        teacherId: template.teacherId,
        template,
      });

      cursor = addDays(cursor, 7);
    }

    return occurrences;
  });
}
