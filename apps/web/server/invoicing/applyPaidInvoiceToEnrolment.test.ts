import assert from "node:assert";

import { BillingType } from "@prisma/client";

import { hasAppliedEntitlements, resolveBlockCoverageWindow } from "./applyPaidInvoiceToEnrolment";
import { resolveCoverageForPlan, resolveWeeklyCoverageWindow } from "./coverage";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function dAest(input: string) {
  return new Date(`${input}T12:00:00+10:00`);
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

test("Scenario D: PER_CLASS blocks purchase credits and pay-ahead extends coverage", () => {
  const start = dAest("2026-02-02");
  const plan = {
    billingType: BillingType.PER_CLASS as const,
    enrolmentType: "BLOCK" as const,
    blockClassCount: 8,
    blockLength: 8,
    durationWeeks: null,
    name: "8 classes over 8 weeks",
    priceCents: 1000,
    levelId: "lvl",
  };
  const enrolment = {
    id: "enrol",
    startDate: start,
    endDate: null,
    paidThroughDate: null,
    student: { familyId: "fam" },
    plan,
  };

  const coverage = resolveCoverageForPlan({
    enrolment,
    plan,
    today: start,
  });

  assert.strictEqual(coverage.coverageStart, null);
  assert.strictEqual(coverage.coverageEnd, null);
  assert.strictEqual(coverage.creditsPurchased, 8);

  const firstWindow = resolveBlockCoverageWindow({
    enrolment: {
      startDate: enrolment.startDate,
      endDate: enrolment.endDate,
      paidThroughDate: enrolment.paidThroughDate,
    },
    plan: { durationWeeks: plan.durationWeeks, blockLength: plan.blockLength },
    today: start,
  });
  assert.strictEqual(firstWindow.coverageEnd.toISOString().slice(0, 10), "2026-03-30");

  const payAheadWindow = resolveBlockCoverageWindow({
    enrolment: {
      startDate: enrolment.startDate,
      endDate: enrolment.endDate,
      paidThroughDate: firstWindow.coverageEnd,
    },
    plan: { durationWeeks: plan.durationWeeks, blockLength: plan.blockLength },
    today: firstWindow.coverageEnd,
  });
  assert.strictEqual(payAheadWindow.coverageEnd.toISOString().slice(0, 10), "2026-05-25");
});

test("Scenario E: PER_WEEK pay-ahead invoices advance coverage sequentially", () => {
  const enrolment = {
    startDate: d("2026-06-01"),
    endDate: null,
    paidThroughDate: null as Date | null,
  };
  const plan = { durationWeeks: 1 };

  const firstWindow = resolveWeeklyCoverageWindow({
    enrolment,
    plan,
    today: d("2026-06-01"),
  });

  assert.strictEqual(firstWindow.coverageStart.toISOString().slice(0, 10), "2026-06-01");
  assert.strictEqual(firstWindow.coverageEnd.toISOString().slice(0, 10), "2026-06-08");

  const secondWindow = resolveWeeklyCoverageWindow({
    enrolment: { ...enrolment, paidThroughDate: firstWindow.coverageEnd },
    plan,
    today: firstWindow.coverageEnd,
  });

  assert.strictEqual(secondWindow.coverageStart.toISOString().slice(0, 10), "2026-06-08");
  assert.strictEqual(secondWindow.coverageEnd.toISOString().slice(0, 10), "2026-06-15");
});
