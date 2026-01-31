import assert from "node:assert";

import { computeProratedPaidThrough } from "@/server/enrolment/moveStudentToClassProration";
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

test("old plan more expensive extends paid-through", () => {
  const result = computeProratedPaidThrough({
    effectiveDate: d("2026-01-01"),
    oldPaidThroughDate: d("2026-01-15"),
    oldPlan: { billingType: BillingType.PER_WEEK, priceCents: 200, sessionsPerWeek: 1, blockClassCount: null },
    newPlan: { billingType: BillingType.PER_WEEK, priceCents: 100, sessionsPerWeek: 1, blockClassCount: null },
    destinationTemplates: [{ dayOfWeek: 0 }],
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-01-29");
});

test("new plan more expensive shortens paid-through", () => {
  const result = computeProratedPaidThrough({
    effectiveDate: d("2026-01-01"),
    oldPaidThroughDate: d("2026-01-15"),
    oldPlan: { billingType: BillingType.PER_WEEK, priceCents: 100, sessionsPerWeek: 1, blockClassCount: null },
    newPlan: { billingType: BillingType.PER_WEEK, priceCents: 200, sessionsPerWeek: 1, blockClassCount: null },
    destinationTemplates: [{ dayOfWeek: 0 }],
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-01-08");
});

test("per-class rounding uses next scheduled occurrence", () => {
  const result = computeProratedPaidThrough({
    effectiveDate: d("2026-01-01"),
    oldPaidThroughDate: d("2026-01-15"),
    oldPlan: { billingType: BillingType.PER_CLASS, priceCents: 200, sessionsPerWeek: 1, blockClassCount: 4 },
    newPlan: { billingType: BillingType.PER_CLASS, priceCents: 100, sessionsPerWeek: 1, blockClassCount: 4 },
    destinationTemplates: [{ dayOfWeek: 0 }],
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-02-02");
});

test("per-week proration does not round to class occurrences", () => {
  const result = computeProratedPaidThrough({
    effectiveDate: d("2026-01-01"),
    oldPaidThroughDate: d("2026-01-15"),
    oldPlan: { billingType: BillingType.PER_WEEK, priceCents: 200, sessionsPerWeek: 1, blockClassCount: null },
    newPlan: { billingType: BillingType.PER_WEEK, priceCents: 100, sessionsPerWeek: 1, blockClassCount: null },
    destinationTemplates: [{ dayOfWeek: 0 }],
  });

  assert.ok(result);
  assert.strictEqual(toBrisbaneDayKey(result), "2026-01-29");
});
