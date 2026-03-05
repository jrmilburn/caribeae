import assert from "node:assert";

import { BillingType, EnrolmentStatus } from "@prisma/client";

import { recordPayment, type RecordPaymentInput } from "./recordPayment";
import { isEnrolmentOverdue } from "@/server/billing/overdue";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import {
  applyEligibleAwayCreditsForEnrolment,
  recalculateAwayAdjustedPaidThroughForEnrolment,
} from "@/server/away/creditConsumption";

process.env.TZ = "Australia/Brisbane";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function test(name: string, fn: () => void | Promise<void>) {
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

type FakeDb = ReturnType<typeof createFakeClient>;

const asRecordPaymentClient = (db: FakeDb) => db as unknown as RecordPaymentInput["client"];

function createFakeClient() {
  let idCounter = 0;
  const payments: any[] = [];
  const paymentAllocations: any[] = [];
  const enrolments: any[] = [];
  const enrolmentCreditEvents: any[] = [];
  const enrolmentCoverageAudits: any[] = [];
  const invoices: any[] = [];
  const invoiceLineItems: any[] = [];
  const enrolmentPlans: any[] = [];
  const enrolmentAdjustments: any[] = [];
  const holidays: { startDate: Date; endDate: Date }[] = [];
  const classCancellations: { templateId: string; date: Date }[] = [];
  const awayPeriods: any[] = [];
  const awayPeriodImpacts: any[] = [];

  const nextId = () => `id-${(idCounter += 1)}`;

  const client = {
    $transaction: async (fn: any) => fn(client),
    payment: {
      findFirst: async ({ where }: any) =>
        payments.find(
          (payment) => payment.familyId === where.familyId && payment.idempotencyKey === where.idempotencyKey
        ) ?? null,
      create: async ({ data }: any) => {
        const record = { id: nextId(), status: "COMPLETED", ...data };
        payments.push(record);
        return record;
      },
    },
    paymentAllocation: {
      findFirst: async ({ where }: any) =>
        paymentAllocations.find((allocation) => allocation.paymentId === where.paymentId) ?? null,
      create: async ({ data }: any) => {
        paymentAllocations.push({ id: nextId(), ...data });
        return data;
      },
    },
    enrolment: {
      findUnique: async ({ where }: any) => enrolments.find((enrolment) => enrolment.id === where.id) ?? null,
      update: async ({ where, data }: any) => {
        const enrolment = enrolments.find((entry) => entry.id === where.id);
        Object.assign(enrolment, data);
        return enrolment;
      },
    },
    holiday: {
      findMany: async () => holidays,
    },
    classCancellation: {
      findMany: async ({ where }: any) => {
        const start = where?.date?.gte ? new Date(where.date.gte) : null;
        const end = where?.date?.lte ? new Date(where.date.lte) : null;
        return classCancellations.filter((cancellation) => {
          if (where?.templateId?.in && !where.templateId.in.includes(cancellation.templateId)) return false;
          if (start && cancellation.date < start) return false;
          if (end && cancellation.date > end) return false;
          return true;
        });
      },
      findUnique: async () => null,
    },
    enrolmentAdjustment: {
      findMany: async () => enrolmentAdjustments,
    },
    enrolmentCreditEvent: {
      create: async ({ data }: any) => {
        enrolmentCreditEvents.push({ id: nextId(), ...data });
        return data;
      },
      createMany: async ({ data }: any) => {
        data.forEach((entry: any) => {
          enrolmentCreditEvents.push({ id: nextId(), ...entry });
        });
        return { count: data.length };
      },
      aggregate: async ({ where }: any) => {
        const sum = enrolmentCreditEvents
          .filter((event) => event.enrolmentId === where.enrolmentId)
          .reduce((acc, event) => acc + event.creditsDelta, 0);
        return { _sum: { creditsDelta: sum } };
      },
      findMany: async ({ where }: any) => {
        return enrolmentCreditEvents.filter((event) => {
          if (where?.enrolmentId && event.enrolmentId !== where.enrolmentId) return false;
          if (where?.type) {
            if (Array.isArray(where.type.in) && !where.type.in.includes(event.type)) return false;
            if (where.type.not && event.type === where.type.not) return false;
            if (typeof where.type === "string" && event.type !== where.type) return false;
          }
          const start = where?.occurredOn?.gte ? new Date(where.occurredOn.gte) : null;
          const end = where?.occurredOn?.lte ? new Date(where.occurredOn.lte) : null;
          if (start && event.occurredOn < start) return false;
          if (end && event.occurredOn > end) return false;
          return true;
        });
      },
      deleteMany: async ({ where }: any) => {
        const before = enrolmentCreditEvents.length;
        for (let i = enrolmentCreditEvents.length - 1; i >= 0; i -= 1) {
          const event = enrolmentCreditEvents[i];
          if (where?.enrolmentId && event.enrolmentId !== where.enrolmentId) continue;
          if (where?.adjustmentId && event.adjustmentId !== where.adjustmentId) continue;
          enrolmentCreditEvents.splice(i, 1);
        }
        return { count: before - enrolmentCreditEvents.length };
      },
    },
    enrolmentCoverageAudit: {
      create: async ({ data }: any) => {
        enrolmentCoverageAudits.push({ id: nextId(), ...data });
        return data;
      },
    },
    enrolmentPlan: {
      findUnique: async ({ where }: any) => enrolmentPlans.find((plan) => plan.id === where.id) ?? null,
    },
    awayPeriod: {
      findUnique: async ({ where }: any) => awayPeriods.find((awayPeriod) => awayPeriod.id === where.id) ?? null,
    },
    awayPeriodImpact: {
      findMany: async ({ where, include }: any) => {
        const rows = awayPeriodImpacts.filter((impact) => {
          if (where?.awayPeriodId && impact.awayPeriodId !== where.awayPeriodId) return false;
          if (where?.enrolmentId && impact.enrolmentId !== where.enrolmentId) return false;
          if (where?.awayPeriod?.deletedAt === null) {
            const awayPeriod = awayPeriods.find((period) => period.id === impact.awayPeriodId);
            if (!awayPeriod || awayPeriod.deletedAt != null) return false;
          }
          return true;
        });
        if (include?.awayPeriod) {
          return rows.map((impact) => ({
            ...impact,
            awayPeriod: awayPeriods.find((period) => period.id === impact.awayPeriodId),
          }));
        }
        return rows;
      },
      createMany: async ({ data }: any) => {
        data.forEach((entry: any) => {
          awayPeriodImpacts.push({
            id: nextId(),
            consumedOccurrences: 0,
            paidThroughDeltaDays: 0,
            ...entry,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        });
        return { count: data.length };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        awayPeriodImpacts.forEach((impact) => {
          if (where?.enrolmentId && impact.enrolmentId !== where.enrolmentId) return;
          Object.assign(impact, data, { updatedAt: new Date() });
          count += 1;
        });
        return { count };
      },
      update: async ({ where, data }: any) => {
        const impact = awayPeriodImpacts.find((entry) => entry.id === where.id);
        Object.assign(impact, data, { updatedAt: new Date() });
        return impact;
      },
    },
    invoice: {
      create: async ({ data }: any) => {
        const record = { id: nextId(), status: data.status ?? "DRAFT", ...data };
        invoices.push(record);
        return record;
      },
    },
    invoiceLineItem: {
      create: async ({ data }: any) => {
        invoiceLineItems.push({ id: nextId(), ...data });
        return data;
      },
    },
    __data: {
      payments,
      paymentAllocations,
      enrolments,
      enrolmentCreditEvents,
      enrolmentCoverageAudits,
      invoices,
      invoiceLineItems,
      enrolmentPlans,
      enrolmentAdjustments,
      holidays,
      classCancellations,
      awayPeriods,
      awayPeriodImpacts,
    },
  };

  return client;
}

function seedWeeklyEnrolment(db: FakeDb, options?: { paidThroughDate?: Date | null }) {
  const enrolment = {
    id: `enrol-${db.__data.enrolments.length + 1}`,
    status: EnrolmentStatus.ACTIVE,
    startDate: d("2026-01-05"),
    endDate: null,
    paidThroughDate: options?.paidThroughDate ?? null,
    paidThroughDateComputed: null,
    creditsRemaining: null,
    creditsBalanceCached: null,
    plan: {
      id: "plan-weekly",
      name: "Weekly plan",
      billingType: BillingType.PER_WEEK,
      durationWeeks: 1,
      sessionsPerWeek: 1,
      priceCents: 2500,
      blockClassCount: null,
      isSaturdayOnly: false,
      alternatingWeeks: false,
      levelId: "level-1",
    },
    student: { familyId: "family-1" },
    template: {
      id: "template-weekly",
      dayOfWeek: 0,
      name: "Monday",
      levelId: "level-1",
      startDate: d("2026-01-01"),
      endDate: null,
      startTime: "16:00",
    },
    classAssignments: [],
  };
  db.__data.enrolmentPlans.push(enrolment.plan);
  db.__data.enrolments.push(enrolment);
  return enrolment;
}

function seedCreditEnrolment(db: FakeDb, options?: { creditsRemaining?: number }) {
  const enrolment = {
    id: `enrol-${db.__data.enrolments.length + 1}`,
    status: EnrolmentStatus.ACTIVE,
    startDate: d("2026-01-05"),
    endDate: null,
    paidThroughDate: null,
    paidThroughDateComputed: null,
    creditsRemaining: options?.creditsRemaining ?? 0,
    creditsBalanceCached: options?.creditsRemaining ?? 0,
    plan: {
      id: "plan-credit",
      name: "Block plan",
      billingType: BillingType.PER_CLASS,
      durationWeeks: null,
      sessionsPerWeek: null,
      priceCents: 4000,
      blockClassCount: 4,
      isSaturdayOnly: false,
      alternatingWeeks: false,
      levelId: "level-1",
    },
    student: { familyId: "family-1" },
    template: {
      id: "template-credit",
      dayOfWeek: 0,
      name: "Monday",
      levelId: "level-1",
      startDate: d("2026-01-01"),
      endDate: null,
      startTime: "16:00:00",
    },
    classAssignments: [],
  };
  db.__data.enrolmentPlans.push(enrolment.plan);
  db.__data.enrolments.push(enrolment);
  return enrolment;
}

function seedAwayPeriodImpact(
  db: FakeDb,
  params: {
    enrolmentId: string;
    startDate: Date;
    endDate?: Date;
    consumedOccurrences?: number;
    paidThroughDeltaDays?: number;
  }
) {
  const awayPeriod = {
    id: `away-${db.__data.awayPeriods.length + 1}`,
    familyId: "family-1",
    studentId: null,
    startDate: params.startDate,
    endDate: params.endDate ?? params.startDate,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db.__data.awayPeriods.push(awayPeriod);
  db.__data.awayPeriodImpacts.push({
    id: `impact-${db.__data.awayPeriodImpacts.length + 1}`,
    awayPeriodId: awayPeriod.id,
    enrolmentId: params.enrolmentId,
    missedOccurrences: 1,
    consumedOccurrences: params.consumedOccurrences ?? 0,
    paidThroughDeltaDays: params.paidThroughDeltaDays ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

test("idempotency: same key does not duplicate payment or entitlements", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db);

  const payload: RecordPaymentInput = {
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "same-key",
    client: asRecordPaymentClient(db),
  };

  await recordPayment(payload);
  const afterFirst = { ...enrolment };

  await recordPayment(payload);

  assert.strictEqual(db.__data.payments.length, 1);
  assert.strictEqual(db.__data.invoices.length, 1);
  assert.strictEqual(enrolment.paidThroughDate?.toISOString(), afterFirst.paidThroughDate?.toISOString());
});

test("overdue flips for weekly enrolments after payment", async () => {
  const db = createFakeClient();
  const weekly = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-01") });

  const now = d("2026-01-06");
  assert.ok(isEnrolmentOverdue(weekly, now));

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: weekly.id,
    idempotencyKey: "weekly-payment",
    client: asRecordPaymentClient(db),
  });

  assert.ok(!isEnrolmentOverdue(weekly, now));
});

test("weekly payments ignore holidays when advancing coverage", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db);
  db.__data.holidays.push({ startDate: d("2026-01-05"), endDate: d("2026-01-12") });

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "holiday-payment",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-12");
});

test("weekly plan switch uses selected plan price and coverage window", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-05") });
  db.__data.enrolmentPlans.push({
    id: "plan-long",
    name: "Six month plan",
    billingType: BillingType.PER_WEEK,
    durationWeeks: 24,
    sessionsPerWeek: 1,
    priceCents: 18000,
    blockClassCount: null,
    isSaturdayOnly: false,
    alternatingWeeks: false,
    levelId: "level-1",
  });

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    planId: "plan-long",
    idempotencyKey: "plan-switch",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(db.__data.payments[0].amountCents, 18000);
  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-06-22");
  assert.strictEqual(db.__data.invoiceLineItems[0].description, "Six month plan");
});

test("manual paid-through forward uses updated baseline for weekly payments", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-12") });

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "manual-forward",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-19");
});

test("manual paid-through backward stays aligned for weekly payments", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-05") });

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "manual-backward",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-12");
});

test("custom block length uses prorated payment and credits", async () => {
  const db = createFakeClient();
  const enrolment = seedCreditEnrolment(db, { creditsRemaining: 0 });

  await recordPayment({
    familyId: "family-1",
    amountCents: 1,
    enrolmentId: enrolment.id,
    customBlockLength: 6,
    idempotencyKey: "custom-block",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(db.__data.payments[0].amountCents, 6000);
  assert.strictEqual(db.__data.invoices[0].creditsPurchased, 6);
});

test("custom block length cannot be below plan block length", async () => {
  const db = createFakeClient();
  const enrolment = seedCreditEnrolment(db, { creditsRemaining: 0 });

  let error: unknown = null;
  try {
    await recordPayment({
      familyId: "family-1",
      amountCents: 1,
      enrolmentId: enrolment.id,
      customBlockLength: 2,
      idempotencyKey: "invalid-block",
      client: asRecordPaymentClient(db),
    });
  } catch (err) {
    error = err;
  }

  assert.ok(error instanceof Error);
});

test("away credit is not applied before paid-through reaches away date", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-12") });
  seedAwayPeriodImpact(db, {
    enrolmentId: enrolment.id,
    startDate: d("2026-01-19"),
  });

  await applyEligibleAwayCreditsForEnrolment(db as any, {
    enrolmentId: enrolment.id,
    actorId: null,
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-12");
  assert.strictEqual(db.__data.awayPeriodImpacts[0].consumedOccurrences, 0);
  assert.strictEqual(db.__data.awayPeriodImpacts[0].paidThroughDeltaDays, 0);
});

test("payment applies newly-eligible away credit once after base advancement", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-12") });
  seedAwayPeriodImpact(db, {
    enrolmentId: enrolment.id,
    startDate: d("2026-01-19"),
  });

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "away-eligible-on-payment",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-26");
  assert.strictEqual(db.__data.awayPeriodImpacts[0].consumedOccurrences, 1);
  assert.strictEqual(db.__data.awayPeriodImpacts[0].paidThroughDeltaDays, 7);
});

test("multiple away credits apply only when eligible and never re-apply", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-12") });
  seedAwayPeriodImpact(db, {
    enrolmentId: enrolment.id,
    startDate: d("2026-01-19"),
  });
  seedAwayPeriodImpact(db, {
    enrolmentId: enrolment.id,
    startDate: d("2026-02-02"),
  });

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "away-multi-1",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-26");
  assert.strictEqual(db.__data.awayPeriodImpacts[0].consumedOccurrences, 1);
  assert.strictEqual(db.__data.awayPeriodImpacts[1].consumedOccurrences, 0);

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "away-multi-2",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-02-09");
  assert.strictEqual(db.__data.awayPeriodImpacts[0].consumedOccurrences, 1);
  assert.strictEqual(db.__data.awayPeriodImpacts[1].consumedOccurrences, 1);

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "away-multi-3",
    client: asRecordPaymentClient(db),
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-02-16");
  assert.strictEqual(db.__data.awayPeriodImpacts[0].consumedOccurrences, 1);
  assert.strictEqual(db.__data.awayPeriodImpacts[1].consumedOccurrences, 1);
});

test("recalculation removes previously applied away extension when away no longer overlaps paid classes", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-19") });
  seedAwayPeriodImpact(db, {
    enrolmentId: enrolment.id,
    startDate: d("2026-01-26"),
    consumedOccurrences: 1,
    paidThroughDeltaDays: 7,
  });

  await recalculateAwayAdjustedPaidThroughForEnrolment(db as any, {
    enrolmentId: enrolment.id,
    actorId: null,
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-12");
  assert.strictEqual(db.__data.awayPeriodImpacts[0].consumedOccurrences, 0);
  assert.strictEqual(db.__data.awayPeriodImpacts[0].paidThroughDeltaDays, 0);
});

test("recalculation applies away extension when away is moved into already-paid coverage", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-19") });
  seedAwayPeriodImpact(db, {
    enrolmentId: enrolment.id,
    startDate: d("2026-01-26"),
    consumedOccurrences: 1,
    paidThroughDeltaDays: 7,
  });

  db.__data.awayPeriods[0].startDate = d("2026-01-12");
  db.__data.awayPeriods[0].endDate = d("2026-01-12");

  await recalculateAwayAdjustedPaidThroughForEnrolment(db as any, {
    enrolmentId: enrolment.id,
    actorId: null,
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-19");
  assert.strictEqual(db.__data.awayPeriodImpacts[0].consumedOccurrences, 1);
  assert.strictEqual(db.__data.awayPeriodImpacts[0].paidThroughDeltaDays, 7);
});
