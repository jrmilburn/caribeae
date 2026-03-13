import assert from "node:assert";

import { resolveCoverageShortenAction } from "./recalculateEnrolmentCoverage";

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

test("holiday removals and edits accept shorter coverage automatically", () => {
  assert.strictEqual(resolveCoverageShortenAction({ reason: "HOLIDAY_REMOVED" }), "ACCEPT");
  assert.strictEqual(resolveCoverageShortenAction({ reason: "HOLIDAY_UPDATED" }), "ACCEPT");
});

test("invoice and cancellation recomputes preserve coverage when they would shorten", () => {
  assert.strictEqual(resolveCoverageShortenAction({ reason: "INVOICE_APPLIED" }), "PRESERVE");
  assert.strictEqual(resolveCoverageShortenAction({ reason: "CANCELLATION_CREATED" }), "PRESERVE");
  assert.strictEqual(resolveCoverageShortenAction({ reason: "CANCELLATION_REVERSED" }), "PRESERVE");
});

test("manual confirmation still overrides reject behaviour", () => {
  assert.strictEqual(resolveCoverageShortenAction({ reason: "CLASS_CHANGED" }), "REJECT");
  assert.strictEqual(resolveCoverageShortenAction({ reason: "PLAN_CHANGED" }), "REJECT");
  assert.strictEqual(resolveCoverageShortenAction({ reason: "CLASS_CHANGED", confirmShorten: true }), "ACCEPT");
});
