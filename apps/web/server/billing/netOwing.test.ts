import assert from "node:assert";

import { BillingType, InvoiceStatus } from "@prisma/client";

import { computeFamilyNetOwingFromData } from "./netOwing";

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

function baseSummary(overdueCents = 0) {
  return {
    overdueOwingCents: overdueCents,
    totalOwingCents: overdueCents,
    nextPaymentDueDayKey: null,
    breakdown: [] as Array<{
      enrolmentId: string;
      studentId: string;
      planId: string | null;
      planType: BillingType | null;
      paidThroughDayKey: string | null;
      overdueBlocks: number;
      overdueOwingCents: number;
    }>,
  };
}

test("payments without invoices yield negative balance and credit", () => {
  const result = computeFamilyNetOwingFromData({
    summary: baseSummary(0),
    openInvoices: [],
    allocationTotalsByInvoiceId: {},
    invoiceTotalsById: {},
    paymentsTotalCents: 12000,
  });

  assert.strictEqual(result.netOwingCents, -12000);
  assert.strictEqual(result.unallocatedCreditCents, 12000);
});

test("partial allocations reduce invoice outstanding", () => {
  const result = computeFamilyNetOwingFromData({
    summary: baseSummary(0),
    openInvoices: [
      {
        id: "inv_1",
        amountCents: 10000,
        amountPaidCents: 0,
        status: InvoiceStatus.SENT,
        enrolmentId: null,
      },
    ],
    allocationTotalsByInvoiceId: { inv_1: 6000 },
    invoiceTotalsById: { inv_1: { amountCents: 10000, status: InvoiceStatus.SENT } },
    paymentsTotalCents: 6000,
  });

  assert.strictEqual(result.invoiceOutstandingCents, 4000);
  assert.strictEqual(result.netOwingCents, 4000);
});

test("overpayments are treated as negative balance credit", () => {
  const result = computeFamilyNetOwingFromData({
    summary: baseSummary(0),
    openInvoices: [],
    allocationTotalsByInvoiceId: { inv_2: 12000 },
    invoiceTotalsById: { inv_2: { amountCents: 10000, status: InvoiceStatus.PAID } },
    paymentsTotalCents: 12000,
  });

  assert.strictEqual(result.unallocatedCreditCents, 2000);
  assert.strictEqual(result.netOwingCents, -2000);
});

test("overdue enrolments with open invoices are not double-counted", () => {
  const summary = baseSummary(5000);
  summary.breakdown = [
    {
      enrolmentId: "enrol_1",
      studentId: "student_1",
      planId: "plan_1",
      planType: BillingType.PER_WEEK,
      paidThroughDayKey: null,
      overdueBlocks: 2,
      overdueOwingCents: 5000,
    },
  ];

  const result = computeFamilyNetOwingFromData({
    summary,
    openInvoices: [
      {
        id: "inv_3",
        amountCents: 5000,
        amountPaidCents: 0,
        status: InvoiceStatus.OVERDUE,
        enrolmentId: "enrol_1",
      },
    ],
    allocationTotalsByInvoiceId: {},
    invoiceTotalsById: { inv_3: { amountCents: 5000, status: InvoiceStatus.OVERDUE } },
    paymentsTotalCents: 0,
  });

  assert.strictEqual(result.overdueOwingCents, 0);
  assert.strictEqual(result.netOwingCents, 5000);
});

test("allocations tied to void invoices count as credit", () => {
  const result = computeFamilyNetOwingFromData({
    summary: baseSummary(0),
    openInvoices: [],
    allocationTotalsByInvoiceId: { inv_4: 3000 },
    invoiceTotalsById: { inv_4: { amountCents: 3000, status: InvoiceStatus.VOID } },
    paymentsTotalCents: 3000,
  });

  assert.strictEqual(result.unallocatedCreditCents, 3000);
  assert.strictEqual(result.netOwingCents, 0);
});
