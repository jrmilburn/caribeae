import assert from "node:assert";

import { computeWeeklyHolidayExtensionWeeks } from "./weeklyHolidayExtensions";

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

test("no holiday sessions yields no extension", () => {
  assert.strictEqual(computeWeeklyHolidayExtensionWeeks(0, 2), 0);
});

test("single missed session extends by one week for multi-session plans", () => {
  assert.strictEqual(computeWeeklyHolidayExtensionWeeks(1, 2), 1);
});

test("multiple missed sessions scale by sessions per week", () => {
  assert.strictEqual(computeWeeklyHolidayExtensionWeeks(3, 2), 2);
});
