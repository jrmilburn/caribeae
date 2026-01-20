import assert from "node:assert";

import { BillingType } from "@prisma/client";

import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { computeFamilyBillingSummary } from "./familyBillingSummary";

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

test("paid-through current and no open invoices => owing 0", () => {
  const summary = computeFamilyBillingSummary({
    enrolments: [
      {
        id: "e1",
        studentId: "s1",
        planId: "p1",
        billingType: BillingType.PER_WEEK,
        planPriceCents: 2500,
        blockClassCount: null,
        paidThroughDate: d("2026-01-15"),
        creditsRemaining: 0,
      },
    ],
    openInvoices: [],
    today: d("2026-01-15"),
  });

  assert.strictEqual(summary.totalOwingCents, 0);
  assert.strictEqual(summary.overdueOwingCents, 0);
});

test("paid-through behind and no open invoices => overdue owing", () => {
  const summary = computeFamilyBillingSummary({
    enrolments: [
      {
        id: "e1",
        studentId: "s1",
        planId: "p1",
        billingType: BillingType.PER_WEEK,
        planPriceCents: 2500,
        blockClassCount: null,
        paidThroughDate: d("2026-01-01"),
        creditsRemaining: 0,
      },
    ],
    openInvoices: [],
    today: d("2026-01-15"),
  });

  assert.strictEqual(summary.overdueOwingCents, 5000);
  assert.strictEqual(summary.totalOwingCents, 5000);
});

test("open invoice coverage removes overdue owing", () => {
  const summary = computeFamilyBillingSummary({
    enrolments: [
      {
        id: "e1",
        studentId: "s1",
        planId: "p1",
        billingType: BillingType.PER_WEEK,
        planPriceCents: 2500,
        blockClassCount: null,
        paidThroughDate: d("2026-01-01"),
        creditsRemaining: 0,
      },
    ],
    openInvoices: [
      {
        enrolmentId: "e1",
        balanceCents: 2500,
        coverageEnd: d("2026-01-20"),
      },
    ],
    today: d("2026-01-15"),
  });

  assert.strictEqual(summary.overdueOwingCents, 0);
  assert.strictEqual(summary.invoiceOwingCents, 2500);
});

test("per-class overdue uses block counts when credits are negative", () => {
  const summary = computeFamilyBillingSummary({
    enrolments: [
      {
        id: "e1",
        studentId: "s1",
        planId: "p1",
        billingType: BillingType.PER_CLASS,
        planPriceCents: 3000,
        blockClassCount: 5,
        paidThroughDate: null,
        creditsRemaining: -6,
      },
    ],
    openInvoices: [],
    today: d("2026-01-10"),
  });

  assert.strictEqual(summary.overdueOwingCents, 6000);
});

test("next payment due uses earliest overdue date", () => {
  const summary = computeFamilyBillingSummary({
    enrolments: [
      {
        id: "e1",
        studentId: "s1",
        planId: "p1",
        billingType: BillingType.PER_WEEK,
        planPriceCents: 2500,
        blockClassCount: null,
        paidThroughDate: d("2026-01-05"),
        creditsRemaining: 0,
      },
      {
        id: "e2",
        studentId: "s2",
        planId: "p2",
        billingType: BillingType.PER_WEEK,
        planPriceCents: 2500,
        blockClassCount: null,
        paidThroughDate: d("2026-01-12"),
        creditsRemaining: 0,
      },
    ],
    openInvoices: [],
    today: d("2026-01-10"),
  });

  assert.strictEqual(summary.nextPaymentDueDayKey, toBrisbaneDayKey(d("2026-01-10")));
});
