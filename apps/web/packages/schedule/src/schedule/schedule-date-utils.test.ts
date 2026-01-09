import assert from "node:assert";
import { addDays } from "date-fns";

import {
  columnDateKeyForDay,
  formatScheduleWeekdayTime,
  scheduleDateAtMinutes,
} from "./schedule-date-utils";

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

test("selection uses column date for Monday occurrence labels", () => {
  const weekStart = new Date("2026-01-05T00:00:00+10:00");
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const mondayKey = columnDateKeyForDay(weekDates, 0);
  assert.strictEqual(mondayKey, "2026-01-05");

  const alignedStart = scheduleDateAtMinutes(weekDates[0], 9 * 60 + 30);
  const label = formatScheduleWeekdayTime(alignedStart);
  assert.ok(label.startsWith("Mon"));
  assert.ok(label.includes("9:30"));
});
