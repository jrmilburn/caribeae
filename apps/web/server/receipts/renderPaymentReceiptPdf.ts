"use server";

import { format } from "date-fns";
import { formatCurrencyFromCents } from "@/lib/currency";
import { BUSINESS_CONTACT_LINES, BUSINESS_NAME } from "./constants";
import { PdfBuilder } from "./pdfBuilder";
import type { PaymentReceiptData } from "./getPaymentReceiptData";

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return format(value, "d MMM yyyy, h:mm aaa");
}

function coalesce(v: string | null | undefined) {
  return v && v.trim().length ? v : "—";
}

export async function renderPaymentReceiptPdf(data: PaymentReceiptData): Promise<Buffer> {
  const builder = new PdfBuilder();

  const generatedAt = new Date();

  // Header
  builder.addText(BUSINESS_NAME, { font: "F2", size: 18 });
  BUSINESS_CONTACT_LINES.forEach((line) => builder.addText(line, { size: 10 }));
  builder.addSpacing(10);
  builder.drawRule({ gapAfter: 14 });

  // Title + meta (keep compact and clearly separated)
  builder.addText("Payment Receipt", { font: "F2", size: 15 });
  builder.addSpacing(6);

  builder.addTable(
    ["", ""],
    [
      ["Receipt ID", data.payment.id],
      ["Generated", formatDateTime(generatedAt)],
    ],
    [
      { width: 22, align: "left" },
      { width: 78, align: "left" },
    ],
    { topGap: 4 }
  );

  builder.addSpacing(12);
  builder.drawRule({ gapAfter: 14 });

  // Family (only show what’s present, but keep alignment)
  builder.addText("Family", { font: "F2", size: 12 });
  builder.addSpacing(6);

  const familyRows: Array<[string, string]> = [
    ["Family", coalesce(data.family.name)],
  ];

  if (data.family.primaryContactName) familyRows.push(["Primary contact", data.family.primaryContactName]);
  if (data.family.primaryEmail) familyRows.push(["Email", data.family.primaryEmail]);
  if (data.family.primaryPhone) familyRows.push(["Phone", data.family.primaryPhone]);

  builder.addTable(
    ["", ""],
    familyRows,
    [
      { width: 22, align: "left" },
      { width: 78, align: "left" },
    ],
    { topGap: 4 }
  );

  builder.addSpacing(12);
  builder.drawRule({ gapAfter: 14 });

  // Payment details (NO pipes — make it scannable)
  builder.addText("Payment details", { font: "F2", size: 12 });
  builder.addSpacing(6);

  builder.addTable(
    ["", ""],
    [
      ["Amount", formatCurrencyFromCents(data.payment.amountCents)],
      ["Paid at", formatDate(data.payment.paidAt)],
      ["Method", coalesce(data.payment.method)],
    ],
    [
      { width: 22, align: "left" },
      { width: 78, align: "left" },
    ],
    { topGap: 4 }
  );

  if (data.payment.note) {
    builder.addSpacing(8);
    builder.addText("Note", { font: "F2", size: 10 });
    builder.addSpacing(2);
    builder.addText(data.payment.note, { size: 10 });
  }

  builder.addSpacing(14);

  // Allocation summary (small, aligned numbers)
  builder.addText("Allocation summary", { font: "F2", size: 12 });
  builder.addSpacing(6);

  builder.addTable(
    ["", ""],
    [
      ["Allocated", formatCurrencyFromCents(data.totals.allocatedCents)],
      ["Unallocated", formatCurrencyFromCents(data.totals.unallocatedCents)],
    ],
    [
      { width: 22, align: "left" },
      { width: 78, align: "left" },
    ],
    { topGap: 4 }
  );

  builder.addSpacing(14);

  // Allocations (keep your existing table)
  builder.addText("Allocations", { font: "F2", size: 12 });

  if (data.allocations.length === 0) {
    builder.addSpacing(6);
    builder.addText("No allocations recorded for this payment.", { size: 10 });
  } else {
    builder.addSpacing(6);
    builder.addTable(
      ["Invoice", "Issued", "Status", "Invoice total", "Allocated"],
      data.allocations.map((a) => [
        a.invoiceId,
        formatDate(a.invoiceIssuedAt),
        a.invoiceStatus,
        formatCurrencyFromCents(a.invoiceTotalCents),
        formatCurrencyFromCents(a.allocatedCents),
      ]),
      [
        { width: 26, align: "left" },  // Invoice ID
        { width: 14, align: "left" },  // Issued
        { width: 14, align: "left" },  // Status
        { width: 18, align: "right" }, // Invoice total
        { width: 18, align: "right" }, // Allocated
      ],
      { topGap: 4 }
    );
  }

  // Footer
  builder.addSpacing(18);
  builder.drawRule({ gapAfter: 10 });
  builder.addText(`Generated on ${formatDateTime(generatedAt)}`, { size: 9 });

  return builder.build();
}
