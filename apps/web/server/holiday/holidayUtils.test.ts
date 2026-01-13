import assert from "node:assert";

import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import {
  holidayAppliesToTemplate,
  holidayRangeIncludesDayKey,
  type HolidayRange,
} from "./holidayUtils";

process.env.TZ = "Australia/Brisbane";

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

test("holiday range matching is inclusive", () => {
  const holiday: HolidayRange = { startDate: d("2026-01-01"), endDate: d("2026-01-03") };
  const startKey = toBrisbaneDayKey(d("2026-01-01"));
  const endKey = toBrisbaneDayKey(d("2026-01-03"));

  assert.strictEqual(holidayRangeIncludesDayKey(holiday, startKey), true);
  assert.strictEqual(holidayRangeIncludesDayKey(holiday, endKey), true);
});

test("holiday scope applies to global/level/template", () => {
  const globalHoliday: HolidayRange = { startDate: d("2026-01-01"), endDate: d("2026-01-01") };
  const levelHoliday: HolidayRange = { startDate: d("2026-01-01"), endDate: d("2026-01-01"), levelId: "lvl" };
  const templateHoliday: HolidayRange = { startDate: d("2026-01-01"), endDate: d("2026-01-01"), templateId: "t1" };

  assert.strictEqual(holidayAppliesToTemplate(globalHoliday, { id: "t1", levelId: "lvl" }), true);
  assert.strictEqual(holidayAppliesToTemplate(levelHoliday, { id: "t1", levelId: "lvl" }), true);
  assert.strictEqual(holidayAppliesToTemplate(levelHoliday, { id: "t1", levelId: "other" }), false);
  assert.strictEqual(holidayAppliesToTemplate(templateHoliday, { id: "t1", levelId: "lvl" }), true);
  assert.strictEqual(holidayAppliesToTemplate(templateHoliday, { id: "t2", levelId: "lvl" }), false);
});
