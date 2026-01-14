import assert from "node:assert";

import { computePaidThroughAfterTemplateChange } from "@/server/billing/paidThroughTemplateChange";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import type { HolidayRange } from "@/server/holiday/holidayUtils";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function test(name: string, fn: () => Promise<void> | void) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✅ ${name}`);
    })
    .catch((error) => {
      console.error(`❌ ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

test("Monday -> Tuesday shifts paid-through forward by one day", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-1",
    enrolmentStartDate: d("2026-03-02"),
    oldPaidThroughDate: d("2026-05-11"),
    oldTemplates: [{ id: "old", dayOfWeek: 0, levelId: "lvl" }],
    newTemplates: [{ id: "new", dayOfWeek: 1, levelId: "lvl" }],
    holidayOverrides: { old: [], new: [] },
  });

  assert.ok(result.newPaidThroughDate);
  assert.strictEqual(toBrisbaneDayKey(result.newPaidThroughDate), "2026-05-12");
});

test("Tuesday -> Monday shifts paid-through backward by one day", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-2",
    enrolmentStartDate: d("2026-03-02"),
    oldPaidThroughDate: d("2026-05-12"),
    oldTemplates: [{ id: "old", dayOfWeek: 1, levelId: "lvl" }],
    newTemplates: [{ id: "new", dayOfWeek: 0, levelId: "lvl" }],
    holidayOverrides: { old: [], new: [] },
  });

  assert.ok(result.newPaidThroughDate);
  assert.strictEqual(toBrisbaneDayKey(result.newPaidThroughDate), "2026-05-11");
});

test("Holiday on new template extends mapped paid-through", async () => {
  const holiday: HolidayRange = { startDate: d("2026-01-27"), endDate: d("2026-01-27") };
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-3",
    enrolmentStartDate: d("2026-01-12"),
    oldPaidThroughDate: d("2026-02-02"),
    oldTemplates: [{ id: "old", dayOfWeek: 0, levelId: "lvl" }],
    newTemplates: [{ id: "new", dayOfWeek: 1, levelId: "lvl" }],
    holidayOverrides: { old: [], new: [holiday] },
  });

  assert.ok(result.newPaidThroughDate);
  assert.strictEqual(toBrisbaneDayKey(result.newPaidThroughDate), "2026-02-10");
});

test("Far-future paid-through maps across templates", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-4",
    enrolmentStartDate: d("2026-01-05"),
    oldPaidThroughDate: d("2026-12-28"),
    oldTemplates: [{ id: "old", dayOfWeek: 0, levelId: "lvl" }],
    newTemplates: [{ id: "new", dayOfWeek: 2, levelId: "lvl" }],
    holidayOverrides: { old: [], new: [] },
  });

  assert.ok(result.newPaidThroughDate);
  assert.strictEqual(toBrisbaneDayKey(result.newPaidThroughDate), "2026-12-30");
});

test("Past paid-through still maps using entitlement count", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-5",
    enrolmentStartDate: d("2024-02-05"),
    oldPaidThroughDate: d("2024-03-04"),
    oldTemplates: [{ id: "old", dayOfWeek: 0, levelId: "lvl" }],
    newTemplates: [{ id: "new", dayOfWeek: 3, levelId: "lvl" }],
    holidayOverrides: { old: [], new: [] },
  });

  assert.ok(result.newPaidThroughDate);
  assert.strictEqual(toBrisbaneDayKey(result.newPaidThroughDate), "2024-03-07");
});
