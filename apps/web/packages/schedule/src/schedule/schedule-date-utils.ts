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

function scheduleDateAtMinutes(date: Date, minutes: number, timeZone: string = SCHEDULE_TIME_ZONE): Date {
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

export function scheduleDateKey(date: Date): string {
  return scheduleDateFormatter.format(date);
}
