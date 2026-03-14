import assert from "node:assert";
import { addDays } from "date-fns";

import {
  alignScheduleEntryToDate,
  columnDateKeyForDay,
  formatScheduleWeekdayTime,
  scheduleDateAtMinutes,
  scheduleDateKey,
  scheduleMinutesSinceMidnight,
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

test("alignScheduleEntryToDate keeps the displayed day aligned with the column date", () => {
  const occurrence = {
    startTime: new Date("2026-03-10T06:00:00.000Z"),
    endTime: new Date("2026-03-10T06:30:00.000Z"),
  };

  const aligned = alignScheduleEntryToDate(occurrence, new Date("2026-03-09T00:00:00+10:00"));

  assert.strictEqual(scheduleDateKey(aligned.startTime), "2026-03-09");
  assert.strictEqual(scheduleDateKey(aligned.endTime), "2026-03-09");
  assert.strictEqual(scheduleMinutesSinceMidnight(aligned.startTime), 16 * 60);
});
