import assert from "node:assert";

import { dateAtMinutesLocal, safeParseDateParam } from "./rangeUtils";

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

test("dateAtMinutesLocal builds a local time at the expected minute offset", () => {
  const day = new Date(2024, 5, 10); // June 10 2024, local TZ
  const result = dateAtMinutesLocal(day, 335); // 05:35

  assert.strictEqual(result.getFullYear(), 2024);
  assert.strictEqual(result.getMonth(), 5);
  assert.strictEqual(result.getDate(), 10);
  assert.strictEqual(result.getHours(), 5);
  assert.strictEqual(result.getMinutes(), 35);
});

test("safeParseDateParam prefers local parsing for yyyy-MM-dd strings", () => {
  const parsed = safeParseDateParam("2024-01-02");
  assert.ok(parsed);
  assert.strictEqual(parsed?.getFullYear(), 2024);
  assert.strictEqual(parsed?.getMonth(), 0);
  assert.strictEqual(parsed?.getDate(), 2);
  assert.strictEqual(parsed?.getHours(), 0);
  assert.strictEqual(parsed?.getMinutes(), 0);
});

