import assert from "node:assert";

import { isEnrolmentOccurringOnDate } from "@/server/enrolment/occurrenceCadence";

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

test("aligned start date attends start week, skips next week, attends following week", () => {
  const enrolment = {
    startDate: new Date("2025-01-06T00:00:00Z"),
    plan: { alternatingWeeks: true },
  };

  assert.strictEqual(
    isEnrolmentOccurringOnDate(enrolment, new Date("2025-01-06T00:00:00Z"), 0),
    true
  );
  assert.strictEqual(
    isEnrolmentOccurringOnDate(enrolment, new Date("2025-01-13T00:00:00Z"), 0),
    false
  );
  assert.strictEqual(
    isEnrolmentOccurringOnDate(enrolment, new Date("2025-01-20T00:00:00Z"), 0),
    true
  );
});

test("mid-cycle start anchors cadence to the first matching class occurrence", () => {
  const enrolment = {
    startDate: new Date("2025-01-07T00:00:00Z"),
    plan: { alternatingWeeks: true },
  };

  assert.strictEqual(
    isEnrolmentOccurringOnDate(enrolment, new Date("2025-01-13T00:00:00Z"), 0),
    true
  );
  assert.strictEqual(
    isEnrolmentOccurringOnDate(enrolment, new Date("2025-01-20T00:00:00Z"), 0),
    false
  );
});

test("timezone-aware date-only comparison ignores time-of-day", () => {
  const enrolment = {
    startDate: new Date("2025-01-05T14:30:00Z"), // 2025-01-06 in Brisbane
    plan: { alternatingWeeks: true },
  };

  assert.strictEqual(
    isEnrolmentOccurringOnDate(enrolment, new Date("2025-01-12T23:59:00Z"), 0),
    false
  );
  assert.strictEqual(
    isEnrolmentOccurringOnDate(enrolment, new Date("2025-01-19T23:00:00Z"), 0),
    true
  );
});
