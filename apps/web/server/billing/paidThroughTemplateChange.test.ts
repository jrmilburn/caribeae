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

test("Monday -> Wednesday shifts paid-through forward within the same week", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-1",
    oldTemplateId: "old",
    newTemplateId: "new",
    paidThroughDate: d("2026-05-11"),
    overrides: {
      enrolment: { startDate: d("2026-03-02") },
      oldTemplate: { id: "old", dayOfWeek: 0, levelId: "lvl" },
      newTemplate: { id: "new", dayOfWeek: 2, levelId: "lvl" },
      holidays: { old: [], new: [] },
      cancellations: { old: [], new: [] },
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-05-13");
});

test("Monday -> Tuesday shifts paid-through forward by one day", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-2",
    oldTemplateId: "old",
    newTemplateId: "new",
    paidThroughDate: d("2026-05-11"),
    overrides: {
      enrolment: { startDate: d("2026-03-02") },
      oldTemplate: { id: "old", dayOfWeek: 0, levelId: "lvl" },
      newTemplate: { id: "new", dayOfWeek: 1, levelId: "lvl" },
      holidays: { old: [], new: [] },
      cancellations: { old: [], new: [] },
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-05-12");
});

test("Holiday on new template extends mapped paid-through", async () => {
  const holiday: HolidayRange = { startDate: d("2026-01-27"), endDate: d("2026-01-27") };
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-3",
    oldTemplateId: "old",
    newTemplateId: "new",
    paidThroughDate: d("2026-02-02"),
    overrides: {
      enrolment: { startDate: d("2026-01-12") },
      oldTemplate: { id: "old", dayOfWeek: 0, levelId: "lvl" },
      newTemplate: { id: "new", dayOfWeek: 1, levelId: "lvl" },
      holidays: { old: [], new: [holiday] },
      cancellations: { old: [], new: [] },
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-02-10");
});

test("Far-future paid-through maps across templates", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-4",
    oldTemplateId: "old",
    newTemplateId: "new",
    paidThroughDate: d("2026-12-28"),
    overrides: {
      enrolment: { startDate: d("2026-01-05") },
      oldTemplate: { id: "old", dayOfWeek: 0, levelId: "lvl" },
      newTemplate: { id: "new", dayOfWeek: 2, levelId: "lvl" },
      holidays: { old: [], new: [] },
      cancellations: { old: [], new: [] },
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-12-30");
});

test("Past paid-through still maps using entitlement count", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-5",
    oldTemplateId: "old",
    newTemplateId: "new",
    paidThroughDate: d("2024-03-04"),
    overrides: {
      enrolment: { startDate: d("2024-02-05") },
      oldTemplate: { id: "old", dayOfWeek: 0, levelId: "lvl" },
      newTemplate: { id: "new", dayOfWeek: 3, levelId: "lvl" },
      holidays: { old: [], new: [] },
      cancellations: { old: [], new: [] },
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2024-03-07");
});

test("Cancellation on new template pushes paid-through to next valid occurrence", async () => {
  const result = await computePaidThroughAfterTemplateChange({
    enrolmentId: "enrol-6",
    oldTemplateId: "old",
    newTemplateId: "new",
    paidThroughDate: d("2026-03-23"),
    overrides: {
      enrolment: { startDate: d("2026-03-02") },
      oldTemplate: { id: "old", dayOfWeek: 0, levelId: "lvl" },
      newTemplate: { id: "new", dayOfWeek: 2, levelId: "lvl" },
      holidays: { old: [], new: [] },
      cancellations: {
        old: [],
        new: [{ templateId: "new", date: d("2026-03-18") }],
      },
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-04-01");
});
