/* eslint-disable @typescript-eslint/no-explicit-any */

import assert from "node:assert";

import { BillingType, InvoiceStatus } from "@prisma/client";

import { createPaymentAndAllocate } from "./invoiceMutations";

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
  const payments: any[] = [];
  const paymentAllocations: any[] = [];
  const invoiceLineItems: any[] = [
    {
      id: "line-1",
      invoiceId: "invoice-1",
      kind: "ENROLMENT",
      description: "Weekly plan",
      quantity: 1,
      unitPriceCents: 5000,
      amountCents: 5000,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const invoices: any[] = [
    {
      id: "invoice-1",
      familyId: "family-1",
      enrolmentId: "enrol-1",
      amountCents: 5000,
      amountPaidCents: 0,
      status: InvoiceStatus.SENT,
      kind: "STANDARD",
      coverageStart: null,
      coverageEnd: null,
      creditsPurchased: null,
      dueAt: new Date("2026-03-20T00:00:00.000Z"),
      issuedAt: new Date("2026-03-13T00:00:00.000Z"),
      paidAt: null,
      entitlementsAppliedAt: null,
      lineItems: invoiceLineItems,
      enrolment: {
        id: "enrol-1",
        planId: "plan-1",
        plan: {
          id: "plan-1",
          billingType: BillingType.PER_WEEK,
          earlyPaymentDiscountBps: 1000,
        },
      },
    },
  ];

  const nextId = () => `id-${(idCounter += 1)}`;
  const findInvoice = (invoiceId: string) => invoices.find((invoice) => invoice.id === invoiceId) ?? null;

  const client = {
    $transaction: async (fn: any) => fn(client),
    payment: {
      findFirst: async ({ where }: any) =>
        payments.find(
          (payment) => payment.familyId === where.familyId && payment.idempotencyKey === where.idempotencyKey
        ) ?? null,
      create: async ({ data }: any) => {
        const record = {
          id: nextId(),
          status: "COMPLETED",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        payments.push(record);
        return record;
      },
    },
    paymentAllocation: {
      aggregate: async ({ where }: any) => ({
        _sum: {
          amountCents: paymentAllocations
            .filter((allocation) => allocation.paymentId === where.paymentId)
            .reduce((sum, allocation) => sum + allocation.amountCents, 0),
        },
      }),
      createMany: async ({ data }: any) => {
        data.forEach((allocation: any) => {
          paymentAllocations.push({
            createdAt: new Date(),
            updatedAt: new Date(),
            ...allocation,
          });
        });
        return { count: data.length };
      },
    },
    invoice: {
      findMany: async ({ where }: any) => {
        if (where?.id?.in) {
          return invoices.filter((invoice) => where.id.in.includes(invoice.id));
        }
        return invoices.filter(
          (invoice) => invoice.familyId === where.familyId && where.status.in.includes(invoice.status)
        );
      },
      findUnique: async ({ where, select, include }: any) => {
        const invoice = findInvoice(where.id);
        if (!invoice) return null;
        if (select) {
          return {
            id: invoice.id,
            status: invoice.status,
            amountPaidCents: invoice.amountPaidCents,
            dueAt: invoice.dueAt,
            issuedAt: invoice.issuedAt,
            paidAt: invoice.paidAt,
          };
        }
        if (include) {
          return invoice;
        }
        return invoice;
      },
      update: async ({ where, data, include }: any) => {
        const invoice = findInvoice(where.id);
        if (!invoice) throw new Error("Invoice not found");
        Object.assign(invoice, data);
        return include ? invoice : invoice;
      },
    },
    invoiceLineItem: {
      create: async ({ data }: any) => {
        const record = {
          id: nextId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        invoiceLineItems.push(record);
        return record;
      },
      aggregate: async ({ where }: any) => ({
        _sum: {
          amountCents: invoiceLineItems
            .filter((lineItem) => lineItem.invoiceId === where.invoiceId)
            .reduce((sum, lineItem) => sum + lineItem.amountCents, 0),
        },
      }),
    },
  };

  return { client, payments, paymentAllocations, invoices, invoiceLineItems };
}

test("createPaymentAndAllocate applies the invoice discount once and stores payment audit fields", async () => {
  const db = createFakeClient();

  const result = await createPaymentAndAllocate({
    familyId: "family-1",
    amountCents: 2000,
    allocations: [{ invoiceId: "invoice-1", amountCents: 2000 }],
    applyEarlyPaymentDiscount: true,
    idempotencyKey: "discounted-allocation",
    client: db.client as any,
    skipAuth: true,
  });

  assert.strictEqual(result.payment.amountCents, 2000);
  assert.strictEqual(result.payment.grossAmountCents, 2500);
  assert.strictEqual(result.payment.earlyPaymentDiscountApplied, true);
  assert.strictEqual(result.payment.earlyPaymentDiscountAmountCents, 500);
  assert.strictEqual(db.invoices[0].amountCents, 4500);
  assert.strictEqual(db.invoices[0].amountPaidCents, 2000);
  assert.strictEqual(db.invoices[0].status, InvoiceStatus.PARTIALLY_PAID);
  assert.strictEqual(
    db.invoiceLineItems.filter((lineItem) => lineItem.description === "Early payment discount").length,
    1
  );
});

test("idempotent retries do not add a duplicate invoice discount line item", async () => {
  const db = createFakeClient();

  await createPaymentAndAllocate({
    familyId: "family-1",
    amountCents: 2000,
    allocations: [{ invoiceId: "invoice-1", amountCents: 2000 }],
    applyEarlyPaymentDiscount: true,
    idempotencyKey: "duplicate-check",
    client: db.client as any,
    skipAuth: true,
  });

  await createPaymentAndAllocate({
    familyId: "family-1",
    amountCents: 2000,
    allocations: [{ invoiceId: "invoice-1", amountCents: 2000 }],
    applyEarlyPaymentDiscount: true,
    idempotencyKey: "duplicate-check",
    client: db.client as any,
    skipAuth: true,
  });

  assert.strictEqual(db.payments.length, 1);
  assert.strictEqual(
    db.invoiceLineItems.filter((lineItem) => lineItem.description === "Early payment discount").length,
    1
  );
});
