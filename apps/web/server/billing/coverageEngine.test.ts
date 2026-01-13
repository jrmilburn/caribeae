import assert from "node:assert";

import {
  computeCoverageEndDay,
  countScheduledSessions,
  countScheduledSessionsExcludingHolidays,
  nextScheduledDayKey,
} from "@/server/billing/coverageEngine";
import { isSameBrisbaneDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import type { HolidayRange } from "@/server/holiday/holidayUtils";

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

test("golden scenario: weekly plan skips holiday for paid-through", () => {
  const holidays: HolidayRange[] = [{ startDate: d("2026-01-26"), endDate: d("2026-01-26") }];
  const paidThrough = computeCoverageEndDay({
    startDayKey: "2026-01-12",
    assignedTemplates: [{ dayOfWeek: 0 }],
    holidays,
    entitlementSessions: 8,
  });

  assert.strictEqual(paidThrough, "2026-03-09");
});

test("recompute preserves entitlement sessions after holiday added", () => {
  const basePaidThrough = "2026-02-02";
  const entitlementSessions = countScheduledSessions({
    startDayKey: "2026-01-12",
    endDayKey: basePaidThrough,
    assignedTemplates: [{ dayOfWeek: 0 }],
  });

  const paidThrough = computeCoverageEndDay({
    startDayKey: "2026-01-12",
    assignedTemplates: [{ dayOfWeek: 0 }],
    holidays: [{ startDate: d("2026-01-26"), endDate: d("2026-01-26") }],
    entitlementSessions,
  });

  assert.strictEqual(entitlementSessions, 4);
  assert.strictEqual(paidThrough, "2026-02-09");
});

test("countScheduledSessionsExcludingHolidays skips holiday sessions", () => {
  const sessions = countScheduledSessionsExcludingHolidays({
    startDayKey: "2026-01-12",
    endDayKey: "2026-02-09",
    assignedTemplates: [{ dayOfWeek: 0 }],
    holidays: [{ startDate: d("2026-01-26"), endDate: d("2026-01-26") }],
  });

  assert.strictEqual(sessions, 4);
});

test("multi-class plan skips holiday and counts both weekdays", () => {
  const paidThrough = computeCoverageEndDay({
    startDayKey: "2026-01-12",
    assignedTemplates: [{ dayOfWeek: 0 }, { dayOfWeek: 2 }],
    holidays: [{ startDate: d("2026-01-14"), endDate: d("2026-01-14") }],
    entitlementSessions: 6,
  });

  assert.strictEqual(paidThrough, "2026-02-02");
});

test("class change Tue->Mon recomputes paid-through", () => {
  const paidThrough = computeCoverageEndDay({
    startDayKey: "2026-01-13",
    assignedTemplates: [{ dayOfWeek: 0 }],
    holidays: [],
    entitlementSessions: 4,
  });

  assert.strictEqual(paidThrough, "2026-02-09");
});

test("multi-class swap Wed->Thu uses both weekdays", () => {
  const paidThrough = computeCoverageEndDay({
    startDayKey: "2026-01-12",
    assignedTemplates: [{ dayOfWeek: 0 }, { dayOfWeek: 3 }],
    holidays: [{ startDate: d("2026-01-22"), endDate: d("2026-01-22") }],
    entitlementSessions: 6,
  });

  assert.strictEqual(paidThrough, "2026-02-02");
});

test("Brisbane day keys remain stable across timezones", () => {
  const brisbaneMidnight = new Date("2026-01-12T00:00:00+10:00");
  const sameDayUtc = new Date("2026-01-11T14:00:00Z");

  assert.ok(isSameBrisbaneDay(brisbaneMidnight, sameDayUtc));
  assert.strictEqual(toBrisbaneDayKey(brisbaneMidnight), "2026-01-12");
});

test("next scheduled day skips holidays", () => {
  const next = nextScheduledDayKey({
    startDayKey: "2026-01-26",
    assignedTemplates: [{ dayOfWeek: 0 }],
    holidays: [{ startDate: d("2026-01-26"), endDate: d("2026-01-26") }],
  });

  assert.strictEqual(next, "2026-02-02");
});
