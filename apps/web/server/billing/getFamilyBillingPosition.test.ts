import assert from "node:assert";

import { BillingType } from "@prisma/client";

import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { calculateAmountOwingCents, calculateNextPaymentDueDayKey } from "./getFamilyBillingPosition";

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

test("amount owing is zero when paid-through is current", () => {
  const amount = calculateAmountOwingCents(
    [
      {
        billingType: BillingType.PER_WEEK,
        paidThroughDate: d("2026-01-15"),
        creditsRemaining: 0,
        planPriceCents: 2400,
        blockClassCount: null,
      },
    ],
    d("2026-01-15")
  );

  assert.strictEqual(amount, 0);
});

test("weekly plans owe by weeks behind", () => {
  const amount = calculateAmountOwingCents(
    [
      {
        billingType: BillingType.PER_WEEK,
        paidThroughDate: d("2026-01-01"),
        creditsRemaining: 0,
        planPriceCents: 2500,
        blockClassCount: null,
      },
    ],
    d("2026-01-15")
  );

  assert.strictEqual(amount, 5000);
});

test("per-class plans owe by unpaid block count", () => {
  const amount = calculateAmountOwingCents(
    [
      {
        billingType: BillingType.PER_CLASS,
        paidThroughDate: null,
        creditsRemaining: -1,
        planPriceCents: 3000,
        blockClassCount: 5,
      },
      {
        billingType: BillingType.PER_CLASS,
        paidThroughDate: null,
        creditsRemaining: -6,
        planPriceCents: 3000,
        blockClassCount: 5,
      },
    ],
    d("2026-01-10")
  );

  assert.strictEqual(amount, 9000);
});

test("next payment due uses earliest paid-through date, clamped to today", () => {
  const nextDue = calculateNextPaymentDueDayKey(
    [
      { paidThroughDate: d("2026-01-05") },
      { paidThroughDate: d("2026-01-12") },
    ],
    d("2026-01-10")
  );

  assert.strictEqual(nextDue, toBrisbaneDayKey(d("2026-01-10")));
});

test("next payment due returns null when no paid-through dates exist", () => {
  const nextDue = calculateNextPaymentDueDayKey([{ paidThroughDate: null }], d("2026-01-10"));
  assert.strictEqual(nextDue, null);
});
