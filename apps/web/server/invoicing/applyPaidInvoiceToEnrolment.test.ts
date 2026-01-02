import assert from "node:assert";

import { hasAppliedEntitlements, resolveBlockCoverageWindow } from "./applyPaidInvoiceToEnrolment";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
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

const plan = { durationWeeks: null, blockLength: 8 };

test("Scenario A: first block payment extends 8 weeks from start", () => {
  const { coverageEnd } = resolveBlockCoverageWindow({
    enrolment: {
      startDate: d("2026-01-05"),
      endDate: null,
      paidThroughDate: null,
    },
    plan,
    today: d("2026-01-05"),
  });

  assert.strictEqual(coverageEnd.toISOString().slice(0, 10), "2026-03-02");
});

test("Scenario B: pay ahead extends from prior paid-through", () => {
  const { coverageEnd } = resolveBlockCoverageWindow({
    enrolment: {
      startDate: d("2026-01-05"),
      endDate: null,
      paidThroughDate: d("2026-03-02"),
    },
    plan,
    today: d("2026-03-02"),
  });

  assert.strictEqual(coverageEnd.toISOString().slice(0, 10), "2026-04-27");
});

test("Scenario C: idempotency guard prevents double application", () => {
  assert.ok(
    hasAppliedEntitlements({
      entitlementsAppliedAt: new Date(),
    })
  );
});
