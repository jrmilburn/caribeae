import assert from "node:assert";

import {
  dayOfWeekToName,
  dayOfWeekToShortLabel,
  normalizeScheduleClass,
  type ScheduleClass,
} from "./schedule-types";

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

test("normalizeScheduleClass uses dayOfWeek for dayName regardless of startTime timezone", () => {
  const scheduleClass: ScheduleClass = {
    id: "occ-1",
    templateId: "template-1",
    templateName: "Monday Class",
    dayOfWeek: 0,
    startTime: new Date("2024-06-10T23:30:00Z"),
    endTime: new Date("2024-06-11T00:15:00Z"),
  };

  const normalized = normalizeScheduleClass(scheduleClass);

  assert.strictEqual(normalized.dayOfWeek, 0);
  assert.strictEqual(normalized.dayName, dayOfWeekToName(0));
});

test("weekday labels stay aligned for Monday across schedule and modal", () => {
  assert.strictEqual(dayOfWeekToName(0), "Monday");
  assert.strictEqual(dayOfWeekToShortLabel(0), "Mon");
});
