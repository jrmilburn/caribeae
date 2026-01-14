import assert from "node:assert";

import { BillingType, EnrolmentStatus } from "@prisma/client";

import { recordPayment } from "./recordPayment";
import { isEnrolmentOverdue } from "@/server/billing/overdue";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

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

function createFakeClient() {
  let idCounter = 0;
  const payments: any[] = [];
  const paymentAllocations: any[] = [];
  const enrolments: any[] = [];
  const enrolmentCreditEvents: any[] = [];
  const enrolmentCoverageAudits: any[] = [];
  const invoices: any[] = [];
  const invoiceLineItems: any[] = [];
  const holidays: { startDate: Date; endDate: Date }[] = [];

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
    enrolmentCreditEvent: {
      create: async ({ data }: any) => {
        enrolmentCreditEvents.push({ id: nextId(), ...data });
        return data;
      },
      aggregate: async ({ where }: any) => {
        const sum = enrolmentCreditEvents
          .filter((event) => event.enrolmentId === where.enrolmentId)
          .reduce((acc, event) => acc + event.creditsDelta, 0);
        return { _sum: { creditsDelta: sum } };
      },
    },
    enrolmentCoverageAudit: {
      create: async ({ data }: any) => {
        enrolmentCoverageAudits.push({ id: nextId(), ...data });
        return data;
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
      holidays,
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
    },
    student: { familyId: "family-1" },
    template: { dayOfWeek: 0, name: "Monday" },
    classAssignments: [],
  };
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
    },
    student: { familyId: "family-1" },
    template: { dayOfWeek: 0, name: "Monday" },
    classAssignments: [],
  };
  db.__data.enrolments.push(enrolment);
  return enrolment;
}

test("idempotency: same key does not duplicate payment or entitlements", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db);

  const payload = {
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "same-key",
    client: db,
  };

  await recordPayment(payload);
  const afterFirst = { ...enrolment };

  await recordPayment(payload);

  assert.strictEqual(db.__data.payments.length, 1);
  assert.strictEqual(db.__data.invoices.length, 1);
  assert.strictEqual(enrolment.paidThroughDate?.toISOString(), afterFirst.paidThroughDate?.toISOString());
});

test("overdue flips based on paidThrough and credits", async () => {
  const db = createFakeClient();
  const weekly = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-01") });
  const credits = seedCreditEnrolment(db, { creditsRemaining: 0 });

  const now = d("2026-01-06");
  assert.ok(isEnrolmentOverdue(weekly, now));
  assert.ok(isEnrolmentOverdue(credits, now));

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: weekly.id,
    idempotencyKey: "weekly-payment",
    client: db,
  });

  await recordPayment({
    familyId: "family-1",
    amountCents: 4000,
    enrolmentId: credits.id,
    idempotencyKey: "credit-payment",
    client: db,
  });

  assert.ok(!isEnrolmentOverdue(weekly, now));
  assert.ok(!isEnrolmentOverdue(credits, now));
});

test("holiday handling extends paidThrough for weekly payments", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db);
  db.__data.holidays.push({ startDate: d("2026-01-05"), endDate: d("2026-01-05") });

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "holiday-payment",
    client: db,
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-12");
});

test("manual paid-through forward uses updated baseline for weekly payments", async () => {
  const db = createFakeClient();
  const enrolment = seedWeeklyEnrolment(db, { paidThroughDate: d("2026-01-12") });

  await recordPayment({
    familyId: "family-1",
    amountCents: 2500,
    enrolmentId: enrolment.id,
    idempotencyKey: "manual-forward",
    client: db,
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
    client: db,
  });

  assert.strictEqual(toBrisbaneDayKey(enrolment.paidThroughDate!), "2026-01-12");
});
