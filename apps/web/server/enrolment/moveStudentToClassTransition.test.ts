import assert from "node:assert";

import { resolveMoveStudentTransitionDates } from "@/server/enrolment/moveStudentToClassTransition";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

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

test("uses explicit end and start dates", () => {
  const result = resolveMoveStudentTransitionDates({
    startDate: d("2026-05-12"),
    endDate: d("2026-05-11"),
    requestedNewPaidThroughDate: d("2026-05-20"),
    currentPaidThroughDate: d("2026-05-18"),
  });

  assert.strictEqual(toBrisbaneDayKey(result.startDate), "2026-05-12");
  assert.strictEqual(toBrisbaneDayKey(result.endDate), "2026-05-11");
  assert.strictEqual(toBrisbaneDayKey(result.newPaidThroughDate), "2026-05-20");
});

test("defaults new paid through to current paid through when not provided", () => {
  const result = resolveMoveStudentTransitionDates({
    startDate: d("2026-05-12"),
    endDate: d("2026-05-11"),
    requestedNewPaidThroughDate: null,
    currentPaidThroughDate: d("2026-05-21"),
  });

  assert.strictEqual(toBrisbaneDayKey(result.newPaidThroughDate), "2026-05-21");
});

test("throws when end date is after start date", () => {
  assert.throws(
    () =>
      resolveMoveStudentTransitionDates({
        startDate: d("2026-05-12"),
        endDate: d("2026-05-13"),
        requestedNewPaidThroughDate: d("2026-05-20"),
        currentPaidThroughDate: d("2026-05-21"),
      }),
    /End current enrolment must be on or before start new enrolment/,
  );
});

test("throws when new paid through is before start date", () => {
  assert.throws(
    () =>
      resolveMoveStudentTransitionDates({
        startDate: d("2026-05-12"),
        endDate: d("2026-05-11"),
        requestedNewPaidThroughDate: d("2026-05-10"),
        currentPaidThroughDate: d("2026-05-21"),
      }),
    /New paid through date must be on or after start new enrolment/,
  );
});
