import assert from "node:assert";

import { resolveMoveStudentPaidThroughDate } from "@/server/enrolment/moveStudentToClassPaidThrough";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function t(id: string, dayOfWeek: number) {
  return {
    id,
    dayOfWeek,
    startDate: d("2026-01-01"),
    endDate: null,
    levelId: "lvl",
    name: id,
  };
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

test("same weekday keeps paid-through unchanged", async () => {
  let called = false;

  const result = await resolveMoveStudentPaidThroughDate({
    tx: {} as never,
    enrolmentId: "enrol-1",
    enrolmentEndDate: null,
    oldPaidThroughDate: d("2026-04-20"),
    changeOverDate: d("2026-04-06"),
    fromTemplate: t("old", 0),
    toTemplate: t("new", 0),
    computePaidThroughAfterTemplateChangeFn: async () => {
      called = true;
      return d("2026-04-22");
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-04-20");
  assert.strictEqual(called, false);
});

test("weekday change remaps paid-through to keep remaining class count", async () => {
  const result = await resolveMoveStudentPaidThroughDate({
    tx: {} as never,
    enrolmentId: "enrol-2",
    enrolmentEndDate: null,
    oldPaidThroughDate: d("2026-04-20"),
    changeOverDate: d("2026-04-06"),
    fromTemplate: t("old", 0),
    toTemplate: t("new", 2),
    overrides: {
      holidays: { old: [], new: [] },
      cancellations: { old: [], new: [] },
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-04-22");
});

test("changeover after paid-through keeps current date", async () => {
  let called = false;

  const result = await resolveMoveStudentPaidThroughDate({
    tx: {} as never,
    enrolmentId: "enrol-3",
    enrolmentEndDate: null,
    oldPaidThroughDate: d("2026-04-20"),
    changeOverDate: d("2026-04-27"),
    fromTemplate: t("old", 0),
    toTemplate: t("new", 2),
    computePaidThroughAfterTemplateChangeFn: async () => {
      called = true;
      return d("2026-04-29");
    },
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-04-20");
  assert.strictEqual(called, false);
});

test("remap fallback keeps original paid-through when mapping returns null", async () => {
  const result = await resolveMoveStudentPaidThroughDate({
    tx: {} as never,
    enrolmentId: "enrol-4",
    enrolmentEndDate: null,
    oldPaidThroughDate: d("2026-04-20"),
    changeOverDate: d("2026-04-06"),
    fromTemplate: t("old", 0),
    toTemplate: t("new", 2),
    computePaidThroughAfterTemplateChangeFn: async () => null,
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-04-20");
});
