import { addDays } from "date-fns";

export const SCHEDULE_TIME_ZONE = "Australia/Brisbane";

const scheduleDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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
    hour: parts.hour === 24 ? 0 : (parts.hour ?? 0),
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

export function scheduleDateAtMinutes(
  date: Date,
  minutes: number,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date {
  const parts = getTimeZoneDateParts(date, timeZone);
  const utcTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day, 0, minutes, 0, 0);
  const offset = getTimeZoneOffset(new Date(utcTimestamp), timeZone);
  return new Date(utcTimestamp - offset);
}

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  return date;
}

export function normalizeToScheduleMidnight(value: Date | string): Date {
  return scheduleDateAtMinutes(asDate(value), 0);
}

export function scheduleMinutesSinceMidnight(
  value: Date | string,
  timeZone: string = SCHEDULE_TIME_ZONE
): number {
  const parts = getTimeZoneDateParts(asDate(value), timeZone);
  return parts.hour * 60 + parts.minute;
}

export function enumerateScheduleDatesInclusive(start: Date | string, end: Date | string): Date[] {
  const startDate = normalizeToScheduleMidnight(start);
  const endDate = normalizeToScheduleMidnight(end);
  if (endDate < startDate) return [];

  const dates: Date[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function scheduleDateKey(date: Date | string): string {
  return scheduleDateFormatter.format(asDate(date));
}

export type DayOfWeekConvention = "monday-0" | "sunday-0" | "monday-1";

export function dayOfWeekToColumnIndex(
  dayOfWeek: number,
  options?: {
    convention?: DayOfWeekConvention;
    weekStartsOnMonday?: boolean;
  }
): number {
  if (!Number.isFinite(dayOfWeek)) return 0;
  const convention = options?.convention ?? "monday-0";
  let mondayIndex: number;

  if (convention === "sunday-0") {
    mondayIndex = (dayOfWeek + 6) % 7;
  } else if (convention === "monday-1") {
    mondayIndex = dayOfWeek === 7 ? 6 : dayOfWeek - 1;
  } else {
    mondayIndex = ((dayOfWeek % 7) + 7) % 7;
  }

  if (options?.weekStartsOnMonday === false) {
    return (mondayIndex + 1) % 7;
  }
  return mondayIndex;
}

export function columnDateKeyForDay(
  weekDates: Date[],
  dayOfWeek: number,
  options?: {
    convention?: DayOfWeekConvention;
    weekStartsOnMonday?: boolean;
  }
): string {
  if (!weekDates.length) {
    throw new Error("weekDates is required");
  }
  const index = dayOfWeekToColumnIndex(dayOfWeek, options);
  const date = weekDates[index] ?? weekDates[0];
  return scheduleDateKey(date);
}

const scheduleDateTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: SCHEDULE_TIME_ZONE,
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const scheduleWeekdayFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: SCHEDULE_TIME_ZONE,
  weekday: "short",
});

export function formatScheduleWeekdayTime(date: Date): string {
  return scheduleDateTimeFormatter.format(date);
}

export function scheduleDateFromKey(dateKey: string, timeZone: string = SCHEDULE_TIME_ZONE): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Invalid schedule date key");
  }
  const utcTimestamp = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offset = getTimeZoneOffset(new Date(utcTimestamp), timeZone);
  return new Date(utcTimestamp - offset);
}

export function scheduleDayOfWeekIndex(date: Date, timeZone: string = SCHEDULE_TIME_ZONE): number {
  const formatter =
    timeZone === SCHEDULE_TIME_ZONE
      ? scheduleWeekdayFormatter
      : new Intl.DateTimeFormat("en-AU", { timeZone, weekday: "short" });
  const day = formatter.format(date);
  const lookup: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return lookup[day] ?? 0;
}

export function scheduleWeekStart(
  date: Date | string,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date {
  const dateKey = typeof date === "string" ? date : scheduleDateKey(date);
  const anchor = scheduleDateFromKey(dateKey, timeZone);
  const dayIndex = scheduleDayOfWeekIndex(anchor, timeZone);
  return scheduleAddDays(anchor, -dayIndex, timeZone);
}

export function scheduleAddDays(
  date: Date,
  days: number,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date {
  const parts = getTimeZoneDateParts(date, timeZone);
  const utcTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0, 0);
  const offset = getTimeZoneOffset(new Date(utcTimestamp), timeZone);
  return new Date(utcTimestamp - offset);
}
