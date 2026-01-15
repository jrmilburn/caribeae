import assert from "node:assert";

import { scheduleDateKey } from "@/packages/schedule";
import { parseDateKey } from "@/lib/dateKey";
import { isSameBrisbaneDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { dateAtMinutesLocal } from "@/server/schedule/rangeUtils";

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

test("schedule navigation preserves Brisbane Monday", () => {
  const brisbaneMorning = dateAtMinutesLocal(new Date("2025-01-12T00:00:00+10:00"), 9 * 60);
  const dateKey = scheduleDateKey(brisbaneMorning);
  const parsed = parseDateKey(dateKey);

  assert.strictEqual(dateKey, "2025-01-12");
  assert.ok(parsed);
  assert.ok(isSameBrisbaneDay(parsed as Date, brisbaneMorning));
});

test("schedule date key is stable near Brisbane midnight", () => {
  const nearMidnightBrisbane = new Date("2025-01-11T14:30:00Z"); // 2025-01-12 00:30 Brisbane
  const dateKey = scheduleDateKey(nearMidnightBrisbane);
  const parsed = parseDateKey(dateKey);

  assert.strictEqual(dateKey, "2025-01-12");
  assert.ok(parsed);
  assert.strictEqual(toBrisbaneDayKey(parsed as Date), "2025-01-12");
});
