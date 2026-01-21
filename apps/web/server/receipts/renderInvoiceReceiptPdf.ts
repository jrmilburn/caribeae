"use server";

import { format } from "date-fns";
import { formatCurrencyFromCents } from "@/lib/currency";
import { BUSINESS_CONTACT_LINES, BUSINESS_NAME } from "./constants";
import { PdfBuilder } from "./pdfBuilder";
import type { InvoiceReceiptData } from "./getInvoiceReceiptData";

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  // Keep your existing UTC-normalized date formatting
  const utcDate = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  return format(utcDate, "d MMM yyyy");
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return format(value, "d MMM yyyy, h:mm aaa");
}

function coalesce(v: string | null | undefined) {
  return v && v.trim().length ? v : "—";
}

export async function renderInvoiceReceiptPdf(data: InvoiceReceiptData): Promise<Buffer> {
  const builder = new PdfBuilder();
  const generatedAt = new Date();

  // Header
  builder.addText(BUSINESS_NAME, { font: "F2", size: 18 });
  BUSINESS_CONTACT_LINES.forEach((line) => builder.addText(line, { size: 10 }));
  builder.addSpacing(10);
  builder.drawRule({ gapAfter: 14 });

  // Title + meta
  const title = data.invoice.status === "VOID" ? "Invoice Receipt (VOID)" : "Invoice Receipt";
  builder.addText(title, { font: "F2", size: 15 });
  builder.addSpacing(6);

  builder.addTable(
    ["", ""],
    [
      ["Invoice ID", data.invoice.id],
      ["Generated", formatDateTime(generatedAt)],
      ["Status", data.invoice.status],
    ],
    [
      { width: 22, align: "left" },
      { width: 78, align: "left" },
    ],
    { topGap: 4 }
  );

  builder.addSpacing(12);
  builder.drawRule({ gapAfter: 14 });

  // Family
  builder.addText("Family", { font: "F2", size: 12 });
  builder.addSpacing(6);

  const familyRows: Array<[string, string]> = [["Family", coalesce(data.family.name)]];
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

  // Invoice details (no pipe lines; keep it scannable)
  builder.addText("Invoice details", { font: "F2", size: 12 });
  builder.addSpacing(6);

  const coverage =
    data.invoice.coverageStart && data.invoice.coverageEnd
      ? `${formatDate(data.invoice.coverageStart)} → ${formatDate(data.invoice.coverageEnd)}`
      : "—";

  const detailsRows: Array<[string, string]> = [
    ["Issued", formatDate(data.invoice.issuedAt)],
    ["Due", formatDate(data.invoice.dueAt)],
    ["Paid on", formatDate(data.invoice.paidAt)],
    ["Coverage", coverage],
  ];

  if (data.invoice.creditsPurchased) {
    detailsRows.push(["Credits purchased", String(data.invoice.creditsPurchased)]);
  }

  builder.addTable(
    ["", ""],
    detailsRows,
    [
      { width: 22, align: "left" },
      { width: 78, align: "left" },
    ],
    { topGap: 4 }
  );

  builder.addSpacing(14);

  // Line items
  builder.addText("Line items", { font: "F2", size: 12 });

  if (data.lineItems.length === 0) {
    builder.addSpacing(6);
    builder.addText("No line items recorded.", { size: 10 });
  } else {
    builder.addSpacing(6);
    builder.addTable(
      ["Description", "Qty", "Unit", "Amount"],
      data.lineItems.map((item) => [
        item.description,
        String(item.quantity),
        formatCurrencyFromCents(item.unitPriceCents),
        formatCurrencyFromCents(item.amountCents),
      ]),
      [
        { width: 54, align: "left" },
        { width: 10, align: "right" },
        { width: 16, align: "right" },
        { width: 20, align: "right" },
      ],
      { topGap: 4 }
    );
  }

  builder.addSpacing(14);

  // Totals (aligned, minimal, easy to read)
  builder.addText("Totals", { font: "F2", size: 12 });
  builder.addSpacing(6);

  builder.addTable(
    ["", ""],
    [
      ["Total", formatCurrencyFromCents(data.totals.totalCents)],
      ["Paid", formatCurrencyFromCents(data.totals.paidCents)],
      ["Balance", formatCurrencyFromCents(data.totals.balanceCents)],
    ],
    [
      { width: 22, align: "left" },
      { width: 78, align: "left" },
    ],
    { topGap: 4 }
  );

  builder.addSpacing(14);

  // Payments applied
  builder.addText("Payments applied", { font: "F2", size: 12 });

  if (data.allocations.length === 0) {
    builder.addSpacing(6);
    builder.addText("No payments have been allocated to this invoice.", { size: 10 });
  } else {
    builder.addSpacing(6);
    builder.addTable(
      ["Payment", "Paid at", "Method", "Allocated"],
      data.allocations.map((a) => [
        a.paymentId,
        formatDate(a.paidAt),
        a.method ?? "—",
        formatCurrencyFromCents(a.amountCents),
      ]),
      [
        { width: 34, align: "left" },
        { width: 22, align: "left" },
        { width: 20, align: "left" },
        { width: 16, align: "right" },
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
