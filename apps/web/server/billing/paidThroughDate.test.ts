import assert from "node:assert";

import type { HolidayRange } from "@/server/holiday/holidayUtils";
import { calculatePaidThroughDate } from "./paidThroughDate";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
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

test("paidThroughDate skips holidays for per-class credits", () => {
  const holidays: HolidayRange[] = [{ startDate: d("2026-01-26"), endDate: d("2026-01-26") }];
  const result = calculatePaidThroughDate({
    startDate: d("2026-01-12"),
    creditsToCover: 8,
    classTemplate: { dayOfWeek: 0, startTime: 9 * 60 },
    holidays,
  });

  assert.ok(result.paidThroughDate);
  assert.strictEqual(result.paidThroughDate?.toISOString().slice(0, 10), "2026-03-09");
});

test("paidThroughDate without holidays matches baseline", () => {
  const result = calculatePaidThroughDate({
    startDate: d("2026-01-12"),
    creditsToCover: 8,
    classTemplate: { dayOfWeek: 0, startTime: 9 * 60 },
    holidays: [],
  });

  assert.ok(result.paidThroughDate);
  assert.strictEqual(result.paidThroughDate?.toISOString().slice(0, 10), "2026-03-02");
});

test("recalc shifts paidThroughDate forward when holiday added", () => {
  const baseline = calculatePaidThroughDate({
    startDate: d("2026-01-12"),
    creditsToCover: 8,
    classTemplate: { dayOfWeek: 0, startTime: 9 * 60 },
    holidays: [],
  });
  const withHoliday = calculatePaidThroughDate({
    startDate: d("2026-01-12"),
    creditsToCover: 8,
    classTemplate: { dayOfWeek: 0, startTime: 9 * 60 },
    holidays: [{ startDate: d("2026-01-26"), endDate: d("2026-01-26") }],
  });

  assert.ok(baseline.paidThroughDate);
  assert.ok(withHoliday.paidThroughDate);
  assert.strictEqual(baseline.paidThroughDate?.toISOString().slice(0, 10), "2026-03-02");
  assert.strictEqual(withHoliday.paidThroughDate?.toISOString().slice(0, 10), "2026-03-09");
});
