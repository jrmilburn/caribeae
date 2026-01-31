import assert from "node:assert";

import { resolveMoveClassDates } from "@/server/enrolment/moveStudentToClass";
import { BillingType } from "@prisma/client";
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

test("move enrolment windows end previous enrolment the day before", () => {
  const result = resolveMoveClassDates({
    effectiveDate: d("2026-04-15"),
    enrolmentStart: d("2026-02-01"),
    enrolmentEnd: null,
    templateStart: d("2026-01-01"),
    templateEnd: null,
    plan: { billingType: BillingType.PER_CLASS, durationWeeks: 12 },
  });

  assert.strictEqual(toBrisbaneDayKey(result.alignedStart), "2026-04-15");
  assert.strictEqual(toBrisbaneDayKey(result.effectiveEnd), "2026-04-14");
});

test("move enrolment respects template start date", () => {
  const result = resolveMoveClassDates({
    effectiveDate: d("2026-01-01"),
    enrolmentStart: d("2026-02-01"),
    enrolmentEnd: null,
    templateStart: d("2026-03-01"),
    templateEnd: null,
    plan: { billingType: BillingType.PER_WEEK, durationWeeks: null },
  });

  assert.strictEqual(toBrisbaneDayKey(result.alignedStart), "2026-03-01");
  assert.strictEqual(toBrisbaneDayKey(result.effectiveEnd), "2026-03-01");
});
