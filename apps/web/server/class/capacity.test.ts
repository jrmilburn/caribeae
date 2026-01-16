import assert from "node:assert";

import { buildCapacityDetails, getCapacityIssue, resolveCapacityIssue } from "./capacity";

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

test("buildCapacityDetails projects the next enrolment count", () => {
  const details = buildCapacityDetails({
    templateId: "t1",
    templateName: "Monday 4pm",
    dayOfWeek: 0,
    startTime: 16 * 60,
    occurrenceDate: new Date("2025-02-03T00:00:00Z"),
    capacity: 6,
    currentCount: 5,
    additionalSeats: 1,
  });

  assert.strictEqual(details.currentCount, 5);
  assert.strictEqual(details.projectedCount, 6);
});

test("getCapacityIssue returns details when capacity would be exceeded", () => {
  const details = buildCapacityDetails({
    templateId: "t1",
    templateName: "Monday 4pm",
    dayOfWeek: 0,
    startTime: 16 * 60,
    occurrenceDate: new Date("2025-02-03T00:00:00Z"),
    capacity: 5,
    currentCount: 5,
    additionalSeats: 1,
  });

  const issue = getCapacityIssue(details);
  assert.ok(issue);
  assert.strictEqual(issue?.projectedCount, 6);
});

test("resolveCapacityIssue respects allowOverload", () => {
  const details = buildCapacityDetails({
    templateId: "t1",
    templateName: "Monday 4pm",
    dayOfWeek: 0,
    startTime: 16 * 60,
    occurrenceDate: new Date("2025-02-03T00:00:00Z"),
    capacity: 5,
    currentCount: 5,
    additionalSeats: 1,
  });

  const blocked = resolveCapacityIssue(details, false);
  assert.ok(blocked);
  const allowed = resolveCapacityIssue(details, true);
  assert.strictEqual(allowed, null);
});
