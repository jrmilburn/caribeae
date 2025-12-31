"use server";

import { format } from "date-fns";

import { formatCurrencyFromCents } from "@/lib/currency";

import { BUSINESS_CONTACT_LINES, BUSINESS_NAME } from "./constants";
import { PdfBuilder } from "./pdfBuilder";
import type { InvoiceReceiptData } from "./getInvoiceReceiptData";

// Audit + integration plan:
// - Invoice PDFs need the same data shown in InvoiceTable and FamilyInvoices: line items, totals derived from items, payment allocations, and status (including VOID).
// - Receipts will be rendered server-side with a lightweight PDF builder to keep Next.js routes fast and avoid client-side generation; buttons will link to /admin/invoice/[id]/receipt.
// - Layout mirrors existing admin styling (clear headings + tables) while staying printer-friendly (monochrome, A4).

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

export async function renderInvoiceReceiptPdf(data: InvoiceReceiptData): Promise<Buffer> {
  const builder = new PdfBuilder();

  builder.addText(BUSINESS_NAME, { font: "F2", size: 16 });
  BUSINESS_CONTACT_LINES.forEach((line) => builder.addText(line, { size: 10 }));
  builder.addSpacing(6);
  builder.drawRule();

  const title = data.invoice.status === "VOID" ? "Invoice Receipt (VOID)" : "Invoice Receipt";
  builder.addText(title, { font: "F2", size: 14 });
  builder.addText(`Invoice ID: ${data.invoice.id}`, { size: 10 });
  builder.addText(`Generated: ${formatDate(new Date())}`, { size: 9 });
  builder.addSpacing(6);

  builder.addText("Family", { font: "F2", size: 12 });
  builder.addText(data.family.name, { size: 11 });
  if (data.family.primaryContactName) builder.addText(data.family.primaryContactName, { size: 10 });
  if (data.family.primaryEmail) builder.addText(data.family.primaryEmail, { size: 10 });
  if (data.family.primaryPhone) builder.addText(data.family.primaryPhone, { size: 10 });
  builder.addSpacing(10);
  builder.drawRule();

  builder.addText("Invoice details", { font: "F2", size: 12 });
  builder.addText(
    `Status: ${data.invoice.status} • Issued ${formatDate(data.invoice.issuedAt)} • Due ${formatDate(data.invoice.dueAt)}`,
    { size: 10 }
  );
  builder.addText(
    `Paid on: ${formatDate(data.invoice.paidAt)} • Coverage: ${
      data.invoice.coverageStart && data.invoice.coverageEnd
        ? `${formatDate(data.invoice.coverageStart)} → ${formatDate(data.invoice.coverageEnd)}`
        : "—"
    }`,
    { size: 10 }
  );
  if (data.invoice.creditsPurchased) {
    builder.addText(`Credits purchased: ${data.invoice.creditsPurchased}`, { size: 10 });
  }
  builder.addSpacing(8);

  builder.addText("Line items", { font: "F2", size: 12 });
  if (data.lineItems.length === 0) {
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
      [54, 10, 16, 20]
    );
  }

  builder.addSpacing(8);
  builder.drawRule();

  builder.addText("Totals", { font: "F2", size: 12 });
  builder.addText(`Total: ${formatCurrencyFromCents(data.totals.totalCents)}`, { size: 11 });
  builder.addText(`Paid: ${formatCurrencyFromCents(data.totals.paidCents)}`, { size: 11 });
  builder.addText(`Balance: ${formatCurrencyFromCents(data.totals.balanceCents)}`, {
    size: 11,
    font: "F2",
  });
  builder.addSpacing(6);

  builder.addText("Payments applied", { font: "F2", size: 12 });
  if (data.allocations.length === 0) {
    builder.addText("No payments have been allocated to this invoice.", { size: 10 });
  } else {
    builder.addTable(
      ["Payment", "Paid at", "Method", "Allocated"],
      data.allocations.map((allocation) => [
        allocation.paymentId,
        formatDate(allocation.paidAt),
        allocation.method ?? "—",
        formatCurrencyFromCents(allocation.amountCents),
      ]),
      [22, 22, 20, 16]
    );
  }

  builder.addSpacing(12);
  builder.drawRule();
  builder.addText(`Generated on ${format(new Date(), "d MMM yyyy, h:mm aaa")}`, { size: 9 });

  return builder.build();
}
