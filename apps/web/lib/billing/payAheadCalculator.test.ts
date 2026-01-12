import assert from "node:assert";

import type { HolidayRange } from "@/server/holiday/holidayUtils";
import { computeBlockPayAheadCoverage } from "./payAheadCalculator";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function dAest(input: string) {
  return new Date(`${input}T12:00:00+10:00`);
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const mondayTemplate = { dayOfWeek: 0, startTime: 9 * 60 };
const fridayTemplate = { dayOfWeek: 4, startTime: 9 * 60 };

test("Pay-ahead coverage matches Goldie block projection", () => {
  const result = computeBlockPayAheadCoverage({
    currentPaidThroughDate: dAest("2026-03-09"),
    enrolmentStartDate: d("2026-01-12"),
    enrolmentEndDate: null,
    classTemplate: mondayTemplate,
    blocksPurchased: 1,
    blockClassCount: 8,
    holidays: [],
  });

  assert.ok(result.coverageStart);
  assert.ok(result.coverageEnd);
  assert.strictEqual(result.coverageStart?.toISOString().slice(0, 10), "2026-03-16");
  assert.strictEqual(result.coverageEnd?.toISOString().slice(0, 10), "2026-05-04");
});

test("Pay-ahead coverage matches Clifton block projection", () => {
  const result = computeBlockPayAheadCoverage({
    currentPaidThroughDate: d("2026-03-13"),
    enrolmentStartDate: d("2026-01-16"),
    enrolmentEndDate: null,
    classTemplate: fridayTemplate,
    blocksPurchased: 1,
    blockClassCount: 8,
    holidays: [],
  });

  assert.ok(result.coverageStart);
  assert.ok(result.coverageEnd);
  assert.strictEqual(result.coverageStart?.toISOString().slice(0, 10), "2026-03-20");
  assert.strictEqual(result.coverageEnd?.toISOString().slice(0, 10), "2026-05-08");
});

test("Pay-ahead starts from enrolment start when no paid-through", () => {
  const result = computeBlockPayAheadCoverage({
    currentPaidThroughDate: null,
    enrolmentStartDate: d("2026-02-02"),
    enrolmentEndDate: null,
    classTemplate: mondayTemplate,
    blocksPurchased: 1,
    blockClassCount: 8,
    holidays: [],
  });

  assert.ok(result.coverageStart);
  assert.ok(result.coverageEnd);
  assert.strictEqual(result.coverageStart?.toISOString().slice(0, 10), "2026-02-02");
  assert.strictEqual(result.coverageEnd?.toISOString().slice(0, 10), "2026-03-23");
});

test("Holiday on a class date extends coverage by a week", () => {
  const holidays: HolidayRange[] = [{ startDate: d("2026-03-23"), endDate: d("2026-03-23") }];
  const result = computeBlockPayAheadCoverage({
    currentPaidThroughDate: d("2026-03-09"),
    enrolmentStartDate: d("2026-01-12"),
    enrolmentEndDate: null,
    classTemplate: mondayTemplate,
    blocksPurchased: 1,
    blockClassCount: 8,
    holidays,
  });

  assert.ok(result.coverageStart);
  assert.ok(result.coverageEnd);
  assert.strictEqual(result.coverageStart?.toISOString().slice(0, 10), "2026-03-16");
  assert.strictEqual(result.coverageEnd?.toISOString().slice(0, 10), "2026-05-11");
});
