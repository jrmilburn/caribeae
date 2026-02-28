import { differenceInCalendarDays } from "date-fns";

import {
  brisbaneAddDays,
  brisbaneCompare,
  brisbaneDayOfWeek,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
  type BrisbaneDayKey,
} from "@/server/dates/brisbaneDay";

type CadenceEnrolment = {
  startDate: Date | string;
  plan?: { alternatingWeeks?: boolean | null } | null;
};

type DayOfWeek = number;

function normalizeDayOfWeek(dayOfWeek: number): DayOfWeek {
  return ((dayOfWeek % 7) + 7) % 7;
}

function resolveClassDayOfWeek(classDate: Date | string, classDayOfWeek?: number | null) {
  if (typeof classDayOfWeek === "number") {
    return normalizeDayOfWeek(classDayOfWeek);
  }
  return normalizeDayOfWeek(brisbaneDayOfWeek(classDate));
}

function nextMatchingDayKey(startDayKey: BrisbaneDayKey, targetDayOfWeek: DayOfWeek): BrisbaneDayKey {
  let cursor = startDayKey;
  while (normalizeDayOfWeek(brisbaneDayOfWeek(cursor)) !== targetDayOfWeek) {
    cursor = brisbaneAddDays(cursor, 1);
  }
  return cursor;
}

export function resolveFirstAttendedClassDayKey(params: {
  enrolmentStartDate: Date | string;
  classDate: Date | string;
  classDayOfWeek?: number | null;
}) {
  const startDayKey = toBrisbaneDayKey(brisbaneStartOfDay(params.enrolmentStartDate));
  const classDow = resolveClassDayOfWeek(params.classDate, params.classDayOfWeek);
  return nextMatchingDayKey(startDayKey, classDow);
}

export function isAlternatingWeekActiveOnDay(params: {
  enrolmentStartDate: Date | string;
  classDate: Date | string;
  classDayOfWeek?: number | null;
}) {
  const classDayKey = toBrisbaneDayKey(brisbaneStartOfDay(params.classDate));
  const firstDayKey = resolveFirstAttendedClassDayKey({
    enrolmentStartDate: params.enrolmentStartDate,
    classDate: params.classDate,
    classDayOfWeek: params.classDayOfWeek,
  });

  if (brisbaneCompare(classDayKey, firstDayKey) < 0) {
    return false;
  }

  const weeksBetween = Math.floor(
    differenceInCalendarDays(brisbaneStartOfDay(classDayKey), brisbaneStartOfDay(firstDayKey)) / 7
  );
  return weeksBetween % 2 === 0;
}

export function isEnrolmentOccurringOnDate(
  enrolment: CadenceEnrolment,
  classDate: Date | string,
  classDayOfWeek?: number | null
) {
  if (!enrolment.plan?.alternatingWeeks) {
    return true;
  }

  return isAlternatingWeekActiveOnDay({
    enrolmentStartDate: enrolment.startDate,
    classDate,
    classDayOfWeek,
  });
}
