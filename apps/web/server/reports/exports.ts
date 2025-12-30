"use server";

import { format } from "date-fns";

import type { AuditReportFilters } from "./getAuditReport";
import { getAuditReport } from "./getAuditReport";

export type CsvExport = {
  filename: string;
  content: string;
};

function toCsvValue(value: string | number | null | undefined) {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes("\"")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  if (str.includes(",") || str.includes("\n")) {
    return `"${str}"`;
  }
  return str;
}

function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((row) => row.map((cell) => toCsvValue(cell)).join(",")).join("\n");
}

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function buildFilename(prefix: string, filters: { from: Date; to: Date }) {
  const from = format(filters.from, "yyyy-MM-dd");
  const to = format(filters.to, "yyyy-MM-dd");
  return `${prefix}-${from}-to-${to}.csv`;
}

export async function exportSalesSummaryCsv(filters: AuditReportFilters): Promise<CsvExport> {
  const report = await getAuditReport(filters);
  const rows: (string | number | null | undefined)[][] = [];

  rows.push(["Sales by kind"]);
  rows.push(["Kind", "Amount", "Quantity"]);
  for (const row of report.sales.summary.totalsByKind) {
    rows.push([row.kind, centsToDollars(row.amountCents), row.quantity]);
  }

  rows.push([]);
  rows.push(["Top products"]);
  rows.push(["Product", "Amount", "Quantity"]);
  for (const row of report.sales.summary.totalsByProduct) {
    rows.push([row.productName, centsToDollars(row.amountCents), row.quantity]);
  }

  rows.push([]);
  rows.push(["Enrolment totals"]);
  rows.push(["Level", "Amount", "Quantity"]);
  if (report.sales.summary.enrolmentTotals.byLevel.length === 0) {
    rows.push(["All levels", centsToDollars(report.sales.summary.enrolmentTotals.totalAmountCents), report.sales.summary.enrolmentTotals.totalQuantity]);
  } else {
    for (const level of report.sales.summary.enrolmentTotals.byLevel) {
      rows.push([level.levelName, centsToDollars(level.amountCents), level.quantity]);
    }
  }

  return {
    filename: buildFilename("audit-sales-summary", report.filters),
    content: toCsv(rows),
  };
}

export async function exportInvoiceLineItemsCsv(filters: AuditReportFilters): Promise<CsvExport> {
  const report = await getAuditReport(filters);
  const rows: (string | number | null | undefined)[][] = [];
  rows.push([
    "Invoice ID",
    "Issued at",
    "Family",
    "Status",
    "Kind",
    "Description",
    "Quantity",
    "Unit price",
    "Amount",
    "Product",
    "Student",
    "Level",
  ]);

  for (const item of report.sales.lineItems) {
    rows.push([
      item.invoiceId,
      item.issuedAt ? format(item.issuedAt, "yyyy-MM-dd") : "",
      item.familyName,
      item.invoiceStatus,
      item.kind,
      item.description,
      item.quantity,
      centsToDollars(item.unitPriceCents),
      centsToDollars(item.amountCents),
      item.productName,
      item.studentName,
      item.levelName,
    ]);
  }

  return {
    filename: buildFilename("audit-invoice-line-items", report.filters),
    content: toCsv(rows),
  };
}

export async function exportPaymentsCsv(filters: AuditReportFilters): Promise<CsvExport> {
  const report = await getAuditReport(filters);
  const rows: (string | number | null | undefined)[][] = [];
  rows.push(["Payment ID", "Paid at", "Family", "Method", "Amount", "Allocated", "Unallocated"]);

  for (const payment of report.cash.payments) {
    rows.push([
      payment.id,
      format(payment.paidAt, "yyyy-MM-dd"),
      payment.familyName,
      payment.method ?? "",
      centsToDollars(payment.amountCents),
      centsToDollars(payment.allocatedCents),
      centsToDollars(payment.unallocatedCents),
    ]);
  }

  return {
    filename: buildFilename("audit-payments", report.filters),
    content: toCsv(rows),
  };
}

export async function exportPaymentAllocationsCsv(filters: AuditReportFilters): Promise<CsvExport> {
  const report = await getAuditReport(filters);
  const rows: (string | number | null | undefined)[][] = [];
  rows.push([
    "Payment ID",
    "Paid at",
    "Payment family",
    "Method",
    "Payment amount",
    "Invoice ID",
    "Invoice family",
    "Invoice status",
    "Invoice issued",
    "Allocation amount",
  ]);

  for (const allocation of report.cash.allocations) {
    rows.push([
      allocation.paymentId,
      format(allocation.paymentPaidAt, "yyyy-MM-dd"),
      allocation.paymentFamilyName,
      allocation.paymentMethod ?? "",
      centsToDollars(allocation.paymentAmountCents),
      allocation.invoiceId,
      allocation.invoiceFamilyName,
      allocation.invoiceStatus,
      allocation.invoiceIssuedAt ? format(allocation.invoiceIssuedAt, "yyyy-MM-dd") : "",
      centsToDollars(allocation.amountCents),
    ]);
  }

  return {
    filename: buildFilename("audit-payment-allocations", report.filters),
    content: toCsv(rows),
  };
}
