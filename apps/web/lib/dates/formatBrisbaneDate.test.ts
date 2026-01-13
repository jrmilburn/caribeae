import assert from "node:assert";

import { formatBrisbaneDate } from "./formatBrisbaneDate";

function dUtc(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function dAest(input: string) {
  return new Date(`${input}T00:00:00+10:00`);
}

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

test("formats Brisbane paid-through dates without a -1 day shift", () => {
  assert.strictEqual(formatBrisbaneDate(dUtc("2026-05-04")), "4 May 2026");
  assert.strictEqual(formatBrisbaneDate(dUtc("2026-05-08")), "8 May 2026");
});

test("formats Brisbane dates consistently for AEST timestamps", () => {
  assert.strictEqual(formatBrisbaneDate(dAest("2026-05-04")), "4 May 2026");
  assert.strictEqual(formatBrisbaneDate(dAest("2026-05-08")), "8 May 2026");
});
