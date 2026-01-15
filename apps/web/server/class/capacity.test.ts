import assert from "node:assert";

import { assertCapacityAvailable, buildCapacityDetails } from "./capacity";

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

test("assertCapacityAvailable throws when capacity would be exceeded", () => {
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

  assert.throws(() => assertCapacityAvailable(details, false));
});

test("assertCapacityAvailable allows overload when explicitly permitted", () => {
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

  assert.doesNotThrow(() => assertCapacityAvailable(details, true));
});
