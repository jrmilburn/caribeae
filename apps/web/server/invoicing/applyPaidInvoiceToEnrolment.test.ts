import assert from "node:assert";

import { BillingType } from "@prisma/client";

import { hasAppliedEntitlements, normalizeCoverageEndForStorage } from "./applyPaidInvoiceToEnrolment";
import { resolveCoverageForPlan, resolveWeeklyPayAheadSequence } from "./coverage";

process.env.TZ = "Australia/Brisbane";

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

const noHolidays: { startDate: Date; endDate: Date }[] = [];

const mondayTemplate = [{ dayOfWeek: 0 }];

test("Scenario C: idempotency guard prevents double application", () => {
  assert.ok(
    hasAppliedEntitlements({
      entitlementsAppliedAt: new Date(),
    })
  );
});

test("Scenario D: coverageEnd stored as Brisbane day (inclusive)", () => {
  const input = new Date("2026-05-04T00:00:00+10:00");
  const normalized = normalizeCoverageEndForStorage(input);
  assert.strictEqual(normalized.toISOString(), "2026-05-04T00:00:00.000Z");
});

test("Scenario E: PER_CLASS blocks purchase credits and pay-ahead extends coverage", () => {
  const start = dAest("2026-02-02");
  const plan = {
    billingType: BillingType.PER_CLASS as const,
    blockClassCount: 8,
    durationWeeks: null,
    name: "8 classes over 8 weeks",
    priceCents: 1000,
    levelId: "lvl",
    sessionsPerWeek: 1,
  };
  const enrolment = {
    id: "enrol",
    startDate: start,
    endDate: null,
    paidThroughDate: null,
    student: { familyId: "fam" },
    plan,
    template: { dayOfWeek: 0, name: "Monday" },
    classAssignments: [],
  };

  const coverage = resolveCoverageForPlan({
    enrolment,
    plan,
    holidays: noHolidays,
    today: start,
  });

  assert.strictEqual(coverage.coverageStart?.toISOString().slice(0, 10), "2026-02-02");
  assert.strictEqual(coverage.coverageEnd?.toISOString().slice(0, 10), "2026-03-23");
  assert.strictEqual(coverage.creditsPurchased, 8);
});

test("Scenario F: PER_WEEK pay-ahead invoices advance coverage sequentially", () => {
  const enrolment = {
    startDate: d("2026-06-01"),
    endDate: null,
    paidThroughDate: null as Date | null,
  };
  const plan = { durationWeeks: 1, sessionsPerWeek: 1 };

  const sequence = resolveWeeklyPayAheadSequence({
    startDate: enrolment.startDate,
    endDate: enrolment.endDate,
    paidThroughDate: enrolment.paidThroughDate,
    durationWeeks: plan.durationWeeks,
    sessionsPerWeek: plan.sessionsPerWeek,
    quantity: 2,
    assignedTemplates: mondayTemplate,
    holidays: noHolidays,
    today: d("2026-06-01"),
  });

  assert.strictEqual(sequence.periods, 2);
  assert.strictEqual(sequence.coverageStart?.toISOString().slice(0, 10), "2026-06-01");
  assert.strictEqual(sequence.coverageEnd?.toISOString().slice(0, 10), "2026-06-15");
});

test("Scenario G: long weekly duration respects quantity and clamps to end date", () => {
  const start = d("2026-07-05");
  const plan = { durationWeeks: 26, sessionsPerWeek: 1 };

  const first = resolveWeeklyPayAheadSequence({
    startDate: start,
    endDate: null,
    paidThroughDate: null,
    durationWeeks: plan.durationWeeks,
    sessionsPerWeek: plan.sessionsPerWeek,
    quantity: 1,
    assignedTemplates: [{ dayOfWeek: 6 }],
    holidays: noHolidays,
    today: start,
  });

  assert.strictEqual(first.periods, 1);
  assert.strictEqual(first.coverageStart?.toISOString().slice(0, 10), "2026-07-05");
  assert.strictEqual(first.coverageEnd?.toISOString().slice(0, 10), "2027-01-03");

  const second = resolveWeeklyPayAheadSequence({
    startDate: start,
    endDate: first.coverageEnd,
    paidThroughDate: first.coverageEnd,
    durationWeeks: plan.durationWeeks,
    sessionsPerWeek: plan.sessionsPerWeek,
    quantity: 1,
    assignedTemplates: [{ dayOfWeek: 6 }],
    holidays: noHolidays,
    today: first.coverageEnd ?? start,
  });

  assert.strictEqual(second.periods, 0);
  assert.strictEqual(second.coverageStart, null);
  assert.strictEqual(second.coverageEnd, null);
});

test("Scenario G: weekly coverage skips holidays after paid-through", () => {
  const enrolment = {
    startDate: d("2026-01-12"),
    endDate: null,
    paidThroughDate: d("2026-02-09"),
    template: { dayOfWeek: 0, name: "Monday" },
    classAssignments: [],
    student: { familyId: "fam" },
  };
  const plan = {
    billingType: BillingType.PER_WEEK as const,
    enrolmentType: "CLASS" as const,
    durationWeeks: 4,
    blockLength: 1,
    blockClassCount: null,
    name: "Weekly",
    priceCents: 1000,
    levelId: "lvl",
    sessionsPerWeek: 1,
  };

  const coverage = resolveCoverageForPlan({
    enrolment,
    plan,
    holidays: [{ startDate: d("2026-03-02"), endDate: d("2026-03-02") }],
    today: d("2026-02-10"),
  });

  assert.strictEqual(coverage.coverageStart?.toISOString().slice(0, 10), "2026-02-16");
  assert.strictEqual(coverage.coverageEnd?.toISOString().slice(0, 10), "2026-03-16");
});
