import assert from "node:assert/strict";

import { countHolidayOccurrences } from "../server/holiday/holidayUtils";
import { normalizeToLocalMidnight } from "../lib/dateUtils";

const enrolmentStart = normalizeToLocalMidnight("2025-01-06"); // Monday
const basePaidThrough = normalizeToLocalMidnight("2025-01-27"); // Monday
const monday = 0;

const singleHoliday = [
  {
    startDate: normalizeToLocalMidnight("2025-01-13"),
    endDate: normalizeToLocalMidnight("2025-01-13"),
  },
];

const twoHolidays = [
  {
    startDate: normalizeToLocalMidnight("2025-01-13"),
    endDate: normalizeToLocalMidnight("2025-01-13"),
  },
  {
    startDate: normalizeToLocalMidnight("2025-01-20"),
    endDate: normalizeToLocalMidnight("2025-01-20"),
  },
];

const overlappingHolidays = [
  {
    startDate: normalizeToLocalMidnight("2025-01-20"),
    endDate: normalizeToLocalMidnight("2025-01-21"),
  },
  {
    startDate: normalizeToLocalMidnight("2025-01-20"),
    endDate: normalizeToLocalMidnight("2025-01-20"),
  },
];

const offDayHoliday = [
  {
    startDate: normalizeToLocalMidnight("2025-01-19"),
    endDate: normalizeToLocalMidnight("2025-01-19"),
  },
];

assert.equal(
  countHolidayOccurrences({
    startDate: enrolmentStart,
    endDate: basePaidThrough,
    templateDayOfWeek: monday,
    holidays: singleHoliday,
  }),
  1
);

assert.equal(
  countHolidayOccurrences({
    startDate: enrolmentStart,
    endDate: basePaidThrough,
    templateDayOfWeek: monday,
    holidays: twoHolidays,
  }),
  2
);

assert.equal(
  countHolidayOccurrences({
    startDate: enrolmentStart,
    endDate: basePaidThrough,
    templateDayOfWeek: monday,
    holidays: overlappingHolidays,
  }),
  1
);

assert.equal(
  countHolidayOccurrences({
    startDate: enrolmentStart,
    endDate: basePaidThrough,
    templateDayOfWeek: monday,
    holidays: offDayHoliday,
  }),
  0
);

console.log("Holiday adjustment checks passed");
