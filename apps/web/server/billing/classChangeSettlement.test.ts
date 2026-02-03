import assert from "node:assert";

import { BillingType } from "@prisma/client";

import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import {
  applyClassChangeSettlement,
  buildClassChangeSettlementKey,
  computeClassChangeSettlement,
  countChargeableClassesInRange,
  resolveChangeOverPaidThroughDate,
} from "./classChangeSettlement";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

await test("Upgrade settlement charges the difference", () => {
  const oldPlan = { billingType: BillingType.PER_WEEK, priceCents: 10000, sessionsPerWeek: 2, blockClassCount: null };
  const newPlan = { billingType: BillingType.PER_WEEK, priceCents: 15000, sessionsPerWeek: 2, blockClassCount: null };

  const settlement = computeClassChangeSettlement({
    oldPlan,
    newPlan,
    chargeableClasses: 4,
    changeOverDate: d("2025-02-03"),
    paidThroughDate: d("2025-02-28"),
  });

  assert.strictEqual(settlement.oldCostPerClassCents, 5000);
  assert.strictEqual(settlement.newCostPerClassCents, 7500);
  assert.strictEqual(settlement.oldValueCents, 20000);
  assert.strictEqual(settlement.newValueCents, 30000);
  assert.strictEqual(settlement.differenceCents, 10000);
});

await test("Downgrade settlement credits the difference", () => {
  const oldPlan = { billingType: BillingType.PER_WEEK, priceCents: 12000, sessionsPerWeek: 2, blockClassCount: null };
  const newPlan = { billingType: BillingType.PER_WEEK, priceCents: 8000, sessionsPerWeek: 2, blockClassCount: null };

  const settlement = computeClassChangeSettlement({
    oldPlan,
    newPlan,
    chargeableClasses: 3,
    changeOverDate: d("2025-03-03"),
    paidThroughDate: d("2025-03-24"),
  });

  assert.strictEqual(settlement.oldValueCents, 18000);
  assert.strictEqual(settlement.newValueCents, 12000);
  assert.strictEqual(settlement.differenceCents, -6000);
});

await test("Same cost results in no settlement", () => {
  const plan = { billingType: BillingType.PER_CLASS, priceCents: 12000, sessionsPerWeek: null, blockClassCount: 4 };
  const settlement = computeClassChangeSettlement({
    oldPlan: plan,
    newPlan: plan,
    chargeableClasses: 5,
    changeOverDate: d("2025-04-07"),
    paidThroughDate: d("2025-04-28"),
  });

  assert.strictEqual(settlement.differenceCents, 0);
});

await test("Change-over after paid-through yields zero chargeable classes", () => {
  const total = countChargeableClassesInRange({
    templates: [{ id: "t1", dayOfWeek: 0, levelId: "level" }],
    startDate: d("2025-05-10"),
    endDate: d("2025-05-01"),
    holidays: [],
    cancellations: [],
  });

  assert.strictEqual(total, 0);
});

await test("Boundary includes the paid-through date when it matches a class", () => {
  const total = countChargeableClassesInRange({
    templates: [{ id: "t1", dayOfWeek: 0, levelId: "level" }],
    startDate: d("2025-01-06"),
    endDate: d("2025-01-06"),
    holidays: [],
    cancellations: [],
  });

  assert.strictEqual(total, 1);
});

await test("Per-class rounding uses cents precision", () => {
  const oldPlan = { billingType: BillingType.PER_CLASS, priceCents: 10000, sessionsPerWeek: null, blockClassCount: 3 };
  const newPlan = { billingType: BillingType.PER_CLASS, priceCents: 9000, sessionsPerWeek: null, blockClassCount: 3 };

  const settlement = computeClassChangeSettlement({
    oldPlan,
    newPlan,
    chargeableClasses: 2,
    changeOverDate: d("2025-06-02"),
    paidThroughDate: d("2025-06-30"),
  });

  assert.strictEqual(settlement.oldValueCents, Math.round(2 * (10000 / 3)));
  assert.strictEqual(settlement.newValueCents, Math.round(2 * (9000 / 3)));
});

await test("Settlement application creates invoice or payment and preserves paid-through", async () => {
  const settlement = computeClassChangeSettlement({
    oldPlan: { billingType: BillingType.PER_WEEK, priceCents: 10000, sessionsPerWeek: 2, blockClassCount: null },
    newPlan: { billingType: BillingType.PER_WEEK, priceCents: 14000, sessionsPerWeek: 2, blockClassCount: null },
    chargeableClasses: 2,
    changeOverDate: d("2025-07-07"),
    paidThroughDate: d("2025-07-21"),
  });

  let invoiceCreated = false;
  let paymentCreated = false;
  const fakeTx = {
    invoiceLineItem: {
      findFirst: async () => null,
    },
    payment: {
      findFirst: async () => null,
    },
  } as unknown as Parameters<typeof applyClassChangeSettlement>[0]["client"];

  const settlementKey = buildClassChangeSettlementKey({
    enrolmentId: "old-enrolment",
    newPlanId: "plan-1",
    changeOverDate: d("2025-07-07"),
    paidThroughDate: d("2025-07-21"),
    templateIds: ["template-1"],
  });

  const result = await applyClassChangeSettlement({
    client: fakeTx,
    familyId: "family-1",
    enrolmentId: "enrol-1",
    settlement,
    settlementKey,
    planId: "plan-1",
    issuedAt: d("2025-07-01"),
    mutations: {
      createInvoice: async () => {
        invoiceCreated = true;
        return { id: "inv-1" } as any;
      },
      createPayment: async () => {
        paymentCreated = true;
        return { payment: { id: "pay-1" } } as any;
      },
    },
  });

  assert.strictEqual(result.paymentId, null);
  assert.ok(result.invoiceId);
  assert.strictEqual(invoiceCreated, true);
  assert.strictEqual(paymentCreated, false);

  const input = d("2025-07-21");
  const preserved = resolveChangeOverPaidThroughDate(input);
  assert.strictEqual(toBrisbaneDayKey(preserved!), toBrisbaneDayKey(input));
});
