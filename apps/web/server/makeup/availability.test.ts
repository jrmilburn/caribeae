import assert from "node:assert";

import { calculateMakeupSessionAvailability } from "@/server/makeup/availability";

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

test("at capacity with one excused scheduled student yields one makeup seat", () => {
  const available = calculateMakeupSessionAvailability({
    capacity: 6,
    scheduledCount: 6,
    excusedScheduledCount: 1,
    bookedMakeupsCount: 0,
  });

  assert.strictEqual(available, 1);
});

test("under capacity by two yields two makeup seats", () => {
  const available = calculateMakeupSessionAvailability({
    capacity: 8,
    scheduledCount: 6,
    excusedScheduledCount: 0,
    bookedMakeupsCount: 0,
  });

  assert.strictEqual(available, 2);
});

test("excused seats and existing makeup bookings net out correctly", () => {
  const available = calculateMakeupSessionAvailability({
    capacity: 8,
    scheduledCount: 8,
    excusedScheduledCount: 2,
    bookedMakeupsCount: 1,
  });

  assert.strictEqual(available, 1);
});
