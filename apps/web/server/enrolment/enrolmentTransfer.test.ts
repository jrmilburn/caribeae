/* eslint-disable @typescript-eslint/no-explicit-any */

import assert from "node:assert";

import { BillingType, EnrolmentStatus, InvoiceLineItemKind, InvoiceStatus, PaymentStatus } from "@prisma/client";

import {
  confirmEnrolmentTransfer,
  previewEnrolmentTransfer,
  type EnrolmentTransferTemplateInput,
} from "./enrolmentTransfer";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

process.env.TZ = "Australia/Brisbane";

function d(input: string) {
  return brisbaneStartOfDay(input);
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

function createFakeClient() {
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${(idCounter += 1)}`;

  const plans: any[] = [];
  const students: any[] = [];
  const templates: any[] = [];
  const enrolments: any[] = [];
  const classAssignments: any[] = [];
  const invoices: any[] = [];
  const invoiceLineItems: any[] = [];
  const payments: any[] = [];
  const paymentAllocations: any[] = [];
  const holidays: any[] = [];
  const classCancellations: any[] = [];
  const enrolmentTransfers: any[] = [];

  function materializeEnrolment(id: string) {
    const enrolment = enrolments.find((entry) => entry.id === id);
    if (!enrolment) return null;
    return {
      ...enrolment,
      student: students.find((student) => student.id === enrolment.studentId) ?? null,
      plan: plans.find((plan) => plan.id === enrolment.planId) ?? null,
      template: templates.find((template) => template.id === enrolment.templateId) ?? null,
      classAssignments: classAssignments
        .filter((assignment) => assignment.enrolmentId === enrolment.id)
        .map((assignment) => ({
          ...assignment,
          template: templates.find((template) => template.id === assignment.templateId) ?? null,
        })),
    };
  }

  function materializeInvoice(invoice: any) {
    return {
      ...invoice,
      lineItems: invoiceLineItems.filter((lineItem) => lineItem.invoiceId === invoice.id),
      allocations: paymentAllocations
        .filter((allocation) => allocation.invoiceId === invoice.id)
        .map((allocation) => ({
          ...allocation,
          payment: payments.find((payment) => payment.id === allocation.paymentId) ?? null,
        })),
    };
  }

  const client = {
    $transaction: async (fn: any) => fn(client),
    $queryRaw: async () => [],
    enrolmentPlan: {
      findUnique: async ({ where }: any) => plans.find((plan) => plan.id === where.id) ?? null,
    },
    enrolment: {
      findUnique: async ({ where }: any) => materializeEnrolment(where.id),
      create: async ({ data }: any) => {
        const record = {
          id: nextId("enrol"),
          billingPrimaryId: null,
          isBillingPrimary: true,
          cancelledAt: null,
          updatedAt: new Date(),
          createdAt: new Date(),
          paidThroughDateComputed: null,
          nextDueDateComputed: null,
          creditsRemaining: null,
          creditsBalanceCached: null,
          ...data,
        };
        enrolments.push(record);
        return materializeEnrolment(record.id);
      },
      update: async ({ where, data }: any) => {
        const enrolment = enrolments.find((entry) => entry.id === where.id);
        if (!enrolment) throw new Error("Enrolment not found");
        Object.assign(enrolment, data, { updatedAt: new Date() });
        return materializeEnrolment(enrolment.id);
      },
    },
    enrolmentClassAssignment: {
      createMany: async ({ data }: any) => {
        data.forEach((entry: any) => {
          classAssignments.push({ id: nextId("assign"), ...entry });
        });
        return { count: data.length };
      },
    },
    enrolmentTransfer: {
      findUnique: async ({ where }: any) => {
        if (where.idempotencyKey) {
          return enrolmentTransfers.find((entry) => entry.idempotencyKey === where.idempotencyKey) ?? null;
        }
        if (where.oldEnrolmentId) {
          return enrolmentTransfers.find((entry) => entry.oldEnrolmentId === where.oldEnrolmentId) ?? null;
        }
        return null;
      },
      create: async ({ data }: any) => {
        const record = {
          id: nextId("transfer"),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        enrolmentTransfers.push(record);
        return record;
      },
    },
    invoice: {
      findMany: async ({ where }: any) => {
        let rows = invoices.slice();
        if (where?.enrolmentId) {
          rows = rows.filter((invoice) => invoice.enrolmentId === where.enrolmentId);
        }
        if (where?.status?.in) {
          rows = rows.filter((invoice) => where.status.in.includes(invoice.status));
        }
        return rows.map(materializeInvoice);
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        invoices.forEach((invoice) => {
          if (where?.id?.in && !where.id.in.includes(invoice.id)) return;
          Object.assign(invoice, data, { updatedAt: new Date() });
          count += 1;
        });
        return { count };
      },
    },
    holiday: {
      findMany: async () => holidays,
    },
    classCancellation: {
      findMany: async ({ where }: any) =>
        classCancellations.filter((cancellation) => {
          if (where?.templateId?.in && !where.templateId.in.includes(cancellation.templateId)) return false;
          if (where?.date?.gte && cancellation.date < where.date.gte) return false;
          if (where?.date?.lte && cancellation.date > where.date.lte) return false;
          return true;
        }),
    },
    paymentAllocation: {
      deleteMany: async ({ where }: any) => {
        const invoiceIds = where?.invoiceId?.in ?? [];
        let count = 0;
        for (let index = paymentAllocations.length - 1; index >= 0; index -= 1) {
          if (!invoiceIds.includes(paymentAllocations[index].invoiceId)) continue;
          paymentAllocations.splice(index, 1);
          count += 1;
        }
        return { count };
      },
      createMany: async ({ data }: any) => {
        data.forEach((entry: any) => paymentAllocations.push({ createdAt: new Date(), updatedAt: new Date(), ...entry }));
        return { count: data.length };
      },
    },
    __data: {
      plans,
      students,
      templates,
      enrolments,
      classAssignments,
      invoices,
      invoiceLineItems,
      payments,
      paymentAllocations,
      holidays,
      classCancellations,
      enrolmentTransfers,
    },
  };

  return client;
}

function seedWeeklyScenario(db: ReturnType<typeof createFakeClient>, options?: { paidThroughDate?: Date | null }) {
  db.__data.plans.push({
    id: "plan-old",
    name: "Old weekly",
    billingType: BillingType.PER_WEEK,
    priceCents: 10000,
    sessionsPerWeek: 1,
    durationWeeks: 1,
    blockClassCount: null,
    alternatingWeeks: false,
    earlyPaymentDiscountBps: 0,
    isSaturdayOnly: false,
    levelId: "level-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    enrolmentType: "ONGOING",
    blockLength: 1,
  });
  db.__data.plans.push({
    id: "plan-new",
    name: "New weekly",
    billingType: BillingType.PER_WEEK,
    priceCents: 10000,
    sessionsPerWeek: 1,
    durationWeeks: 1,
    blockClassCount: null,
    alternatingWeeks: false,
    earlyPaymentDiscountBps: 0,
    isSaturdayOnly: false,
    levelId: "level-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    enrolmentType: "ONGOING",
    blockLength: 1,
  });
  db.__data.students.push({
    id: "student-1",
    familyId: "family-1",
    levelId: "level-1",
    name: "Student One",
  });
  db.__data.templates.push({
    id: "template-old",
    name: "Monday class",
    dayOfWeek: 0,
    levelId: "level-1",
    startDate: d("2026-01-01"),
    endDate: null,
    startTime: 900,
  });
  db.__data.templates.push({
    id: "template-new",
    name: "Wednesday class",
    dayOfWeek: 2,
    levelId: "level-1",
    startDate: d("2026-01-01"),
    endDate: null,
    startTime: 900,
  });
  db.__data.enrolments.push({
    id: "enrol-old",
    studentId: "student-1",
    templateId: "template-old",
    planId: "plan-old",
    billingGroupId: "group-1",
    isBillingPrimary: true,
    billingPrimaryId: null,
    transferFromEnrolmentId: null,
    transferEffectiveAt: null,
    transferMetadata: null,
    startDate: d("2026-01-05"),
    endDate: null,
    status: EnrolmentStatus.ACTIVE,
    cancelledAt: null,
    paidThroughDate: options?.paidThroughDate ?? null,
    paidThroughDateComputed: options?.paidThroughDate ?? null,
    nextDueDateComputed: null,
    creditsRemaining: null,
    creditsBalanceCached: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  db.__data.classAssignments.push({
    id: "assign-old",
    enrolmentId: "enrol-old",
    templateId: "template-old",
  });
}

function newTemplate(): EnrolmentTransferTemplateInput[] {
  return [
    {
      id: "template-new",
      name: "Wednesday class",
      dayOfWeek: 2,
      levelId: "level-1",
      startDate: d("2026-01-01"),
      endDate: null,
      startTime: 900,
    },
  ];
}

test("preview surfaces old outstanding when no invoice has been paid", async () => {
  const db = createFakeClient();
  seedWeeklyScenario(db);

  const preview = await previewEnrolmentTransfer({
    oldEnrolmentId: "enrol-old",
    newPlanId: "plan-new",
    newTemplates: newTemplate(),
    transferEffectiveAt: d("2026-01-12"),
    client: db as any,
  });

  assert.strictEqual(preview.oldOutstandingCents, 10000);
  assert.strictEqual(preview.oldOverpaidCreditCents, 0);
  assert.strictEqual(preview.newBlockChargeCents, 10000);
  assert.strictEqual(preview.totalDueTodayCents, 20000);
});

test("preview exposes remaining paid weekly coverage as transfer credit", async () => {
  const db = createFakeClient();
  seedWeeklyScenario(db, { paidThroughDate: d("2026-01-19") });

  const preview = await previewEnrolmentTransfer({
    oldEnrolmentId: "enrol-old",
    newPlanId: "plan-new",
    newTemplates: newTemplate(),
    transferEffectiveAt: d("2026-01-12"),
    client: db as any,
  });

  assert.strictEqual(preview.oldOutstandingCents, 0);
  assert.strictEqual(preview.oldOverpaidCreditCents, 10000);
  assert.strictEqual(preview.newBlockChargeCents, 10000);
  assert.strictEqual(preview.creditAppliedToNewInvoiceCents, 10000);
  assert.strictEqual(preview.totalDueTodayCents, 0);
});

test("preview preserves prior paid allocations on an open old invoice during transfer", async () => {
  const db = createFakeClient();
  seedWeeklyScenario(db);

  db.__data.invoices.push({
    id: "invoice-1",
    familyId: "family-1",
    enrolmentId: "enrol-old",
    amountCents: 10000,
    amountPaidCents: 4000,
    status: InvoiceStatus.PARTIALLY_PAID,
    kind: "STANDARD",
    coverageStart: d("2026-01-05"),
    coverageEnd: d("2026-01-12"),
    creditsPurchased: null,
    dueAt: d("2026-01-12"),
    issuedAt: d("2026-01-05"),
    paidAt: null,
    entitlementsAppliedAt: null,
  });
  db.__data.invoiceLineItems.push({
    id: "line-1",
    invoiceId: "invoice-1",
    kind: InvoiceLineItemKind.ENROLMENT,
    description: "Weekly plan",
    quantity: 1,
    unitPriceCents: 10000,
    amountCents: 10000,
    enrolmentId: "enrol-old",
    planId: "plan-old",
  });
  db.__data.payments.push({
    id: "payment-1",
    familyId: "family-1",
    amountCents: 4000,
    grossAmountCents: 4000,
    earlyPaymentDiscountApplied: false,
    earlyPaymentDiscountAmountCents: 0,
    paidAt: d("2026-01-06"),
    method: "Cash",
    note: null,
    idempotencyKey: null,
    status: PaymentStatus.COMPLETED,
  });
  db.__data.paymentAllocations.push({
    paymentId: "payment-1",
    invoiceId: "invoice-1",
    amountCents: 4000,
  });

  const preview = await previewEnrolmentTransfer({
    oldEnrolmentId: "enrol-old",
    newPlanId: "plan-new",
    newTemplates: newTemplate(),
    transferEffectiveAt: d("2026-01-12"),
    client: db as any,
  });

  assert.strictEqual(preview.oldOutstandingCents, 10000);
  assert.strictEqual(preview.releasedPaymentCreditCents, 4000);
  assert.strictEqual(preview.recommendedAllocations.releasedPaymentToOldInvoiceCents, 4000);
  assert.strictEqual(preview.recommendedAllocations.cashToOldInvoiceCents, 6000);
});

test("confirm is idempotent for the same key", async () => {
  const db = createFakeClient();
  seedWeeklyScenario(db);
  db.__data.plans.find((plan) => plan.id === "plan-old")!.priceCents = 0;
  db.__data.plans.find((plan) => plan.id === "plan-new")!.priceCents = 0;

  const first = await confirmEnrolmentTransfer({
    oldEnrolmentId: "enrol-old",
    newPlanId: "plan-new",
    newTemplates: newTemplate(),
    transferEffectiveAt: d("2026-01-12"),
    idempotencyKey: "transfer-key",
    client: db as any,
  });

  const second = await confirmEnrolmentTransfer({
    oldEnrolmentId: "enrol-old",
    newPlanId: "plan-new",
    newTemplates: newTemplate(),
    transferEffectiveAt: d("2026-01-12"),
    idempotencyKey: "transfer-key",
    client: db as any,
  });

  assert.strictEqual(first.transferId, second.transferId);
  assert.strictEqual(db.__data.enrolmentTransfers.length, 1);
});

test("confirm rejects a second transfer attempt with a different key", async () => {
  const db = createFakeClient();
  seedWeeklyScenario(db);
  db.__data.plans.find((plan) => plan.id === "plan-old")!.priceCents = 0;
  db.__data.plans.find((plan) => plan.id === "plan-new")!.priceCents = 0;

  await confirmEnrolmentTransfer({
    oldEnrolmentId: "enrol-old",
    newPlanId: "plan-new",
    newTemplates: newTemplate(),
    transferEffectiveAt: d("2026-01-12"),
    idempotencyKey: "transfer-key-1",
    client: db as any,
  });

  await assert.rejects(
    () =>
      confirmEnrolmentTransfer({
        oldEnrolmentId: "enrol-old",
        newPlanId: "plan-new",
        newTemplates: newTemplate(),
        transferEffectiveAt: d("2026-01-12"),
        idempotencyKey: "transfer-key-2",
        client: db as any,
      }),
    /already been transferred/
  );
});
