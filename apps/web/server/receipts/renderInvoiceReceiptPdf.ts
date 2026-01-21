"use server";

import { format } from "date-fns";
import { formatCurrencyFromCents } from "@/lib/currency";
import { BUSINESS_CONTACT_LINES, BUSINESS_NAME } from "./constants";
import { PdfBuilder } from "./pdfBuilder";
import type { InvoiceReceiptData } from "./getInvoiceReceiptData";

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  const utcDate = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  return format(utcDate, "d MMM yyyy");
}

export async function renderInvoiceReceiptPdf(data: InvoiceReceiptData): Promise<Buffer> {
  const builder = new PdfBuilder();

  // Header
  builder.addText(BUSINESS_NAME, { font: "F2", size: 18 });
  BUSINESS_CONTACT_LINES.forEach((line) => builder.addText(line, { size: 10 }));
  builder.addSpacing(8);
  builder.drawRule({ gapAfter: 14 });

  // Title block
  const title = data.invoice.status === "VOID" ? "Invoice Receipt (VOID)" : "Invoice Receipt";
  builder.addText(title, { font: "F2", size: 15 });
  builder.addText(`Invoice ID: ${data.invoice.id}`, { size: 10 });
  builder.addText(`Generated: ${formatDate(new Date())}`, { size: 9 });
  builder.addSpacing(12);

  // Family
  builder.addText("Family", { font: "F2", size: 12 });
  builder.addSpacing(2);
  builder.addText(data.family.name, { size: 11 });
  if (data.family.primaryContactName) builder.addText(data.family.primaryContactName, { size: 10 });
  if (data.family.primaryEmail) builder.addText(data.family.primaryEmail, { size: 10 });
  if (data.family.primaryPhone) builder.addText(data.family.primaryPhone, { size: 10 });

  builder.addSpacing(12);
  builder.drawRule({ gapAfter: 14 });

  // Invoice details
  builder.addText("Invoice details", { font: "F2", size: 12 });
  builder.addSpacing(4);

  builder.addText(
    `Status: ${data.invoice.status} | Issued ${formatDate(data.invoice.issuedAt)} | Due ${formatDate(
      data.invoice.dueAt
    )}`,
    { size: 10 }
  );

  const coverage =
    data.invoice.coverageStart && data.invoice.coverageEnd
      ? `${formatDate(data.invoice.coverageStart)} -> ${formatDate(data.invoice.coverageEnd)}`
      : "—";

  builder.addText(`Paid on: ${formatDate(data.invoice.paidAt)} | Coverage: ${coverage}`, { size: 10 });

  if (data.invoice.creditsPurchased) {
    builder.addText(`Credits purchased: ${data.invoice.creditsPurchased}`, { size: 10 });
  }

  builder.addSpacing(14);

  // Line items
  builder.addText("Line items", { font: "F2", size: 12 });

  if (data.lineItems.length === 0) {
    builder.addSpacing(4);
    builder.addText("No line items recorded.", { size: 10 });
  } else {
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
      { topGap: 6 }
    );
  }

  builder.addSpacing(12);

  // Totals
  builder.addText("Totals", { font: "F2", size: 12 });
  builder.addSpacing(4);

  builder.addText(`Total: ${formatCurrencyFromCents(data.totals.totalCents)}`, { size: 11 });
  builder.addText(`Paid: ${formatCurrencyFromCents(data.totals.paidCents)}`, { size: 11 });
  builder.addText(`Balance: ${formatCurrencyFromCents(data.totals.balanceCents)}`, { size: 11, font: "F2" });

  builder.addSpacing(14);

  // Payments applied
  builder.addText("Payments applied", { font: "F2", size: 12 });

  if (data.allocations.length === 0) {
    builder.addSpacing(4);
    builder.addText("No payments have been allocated to this invoice.", { size: 10 });
  } else {
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
      { topGap: 6 }
    );
  }

  // Footer
  builder.addSpacing(18);
  builder.drawRule({ gapAfter: 10 });
  builder.addText(`Generated on ${format(new Date(), "d MMM yyyy, h:mm aaa")}`, { size: 9 });

  return builder.build();
}
