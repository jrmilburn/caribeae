import { addDays, addMinutes, endOfDay, format, getISODay, isValid, parse, parseISO, startOfDay } from "date-fns";
import type { Prisma } from "@prisma/client";

import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

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

export function safeParseDateParam(value: DateParam): Date | null {
  if (!value) return null;

  const parsed =
    value instanceof Date
      ? value
      : parse(value, "yyyy-MM-dd", new Date());

  if (isValid(parsed)) return parsed;

  const fallback = value instanceof Date ? value : parseISO(value);
  if (!fallback || !isValid(fallback)) return null;
  return fallback;
}

export function formatAsDateParam(value: Date): string {
  return format(startOfDay(value), "yyyy-MM-dd");
}

export function normalizeDateRange(params: {
  from?: DateParam;
  to?: DateParam;
  defaultFrom?: Date;
  defaultTo?: Date;
}): NormalizedDateRange {
  const baseFrom = params.from ?? params.defaultFrom ?? new Date();
  const baseTo = params.to ?? params.defaultTo ?? baseFrom;

  const normalizedFrom = startOfDay(normalizeLocalDate(baseFrom));
  const normalizedTo = endOfDay(normalizeLocalDate(baseTo));

  if (normalizedTo.getTime() < normalizedFrom.getTime()) {
    throw new Error("Range end must be on or after range start");
  }

  return { from: normalizedFrom, to: normalizedTo };
}

export function dateAtMinutesLocal(day: Date, minutes: number): Date {
  const midnightLocal = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    0,
    0,
    0,
    0
  );
  return addMinutes(midnightLocal, minutes);
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

    const rangeStart = startOfDay(range.from);
    const rangeEnd = endOfDay(range.to);
    const templateStart = startOfDay(template.startDate);
    const templateEnd = template.endDate ? endOfDay(template.endDate) : null;

    if (templateEnd && templateEnd < rangeStart) return [];
    if (templateStart > rangeEnd) return [];

    const targetIsoDay = template.dayOfWeek === 6 ? 7 : template.dayOfWeek + 1; // Prisma comment: 0=Mon..6=Sun
    let cursor = startOfDay(rangeStart);
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
