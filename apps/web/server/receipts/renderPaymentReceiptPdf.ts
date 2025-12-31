"use server";

import { format } from "date-fns";

import { formatCurrencyFromCents } from "@/lib/currency";

import { BUSINESS_CONTACT_LINES, BUSINESS_NAME } from "./constants";
import { PdfBuilder } from "./pdfBuilder";
import type { PaymentReceiptData } from "./getPaymentReceiptData";

// Audit + integration plan:
// - Payments are listed in PaymentTable and inside FamilyInvoices; receipts need the same allocation breakdown (invoice id, status, issued date, total + allocated amount).
// - PDFs stay server-side via a lightweight builder and admin-only routes at /admin/payment/[id]/receipt, matching button patterns used elsewhere.
// - Layout mirrors invoice receipts (header + summary + allocation table) with printer-friendly, monochrome styling.

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

export async function renderPaymentReceiptPdf(data: PaymentReceiptData): Promise<Buffer> {
  const builder = new PdfBuilder();

  builder.addText(BUSINESS_NAME, { font: "F2", size: 16 });
  BUSINESS_CONTACT_LINES.forEach((line) => builder.addText(line, { size: 10 }));
  builder.addSpacing(6);
  builder.drawRule();

  builder.addText("Payment Receipt", { font: "F2", size: 14 });
  builder.addText(`Payment ID: ${data.payment.id}`, { size: 10 });
  builder.addText(`Generated: ${formatDate(new Date())}`, { size: 9 });
  builder.addSpacing(6);

  builder.addText("Family", { font: "F2", size: 12 });
  builder.addText(data.family.name, { size: 11 });
  if (data.family.primaryContactName) builder.addText(data.family.primaryContactName, { size: 10 });
  if (data.family.primaryEmail) builder.addText(data.family.primaryEmail, { size: 10 });
  if (data.family.primaryPhone) builder.addText(data.family.primaryPhone, { size: 10 });
  builder.addSpacing(10);
  builder.drawRule();

  builder.addText("Payment details", { font: "F2", size: 12 });
  builder.addText(`Paid at: ${formatDate(data.payment.paidAt)} • Method: ${data.payment.method ?? "—"}`, {
    size: 10,
  });
  builder.addText(`Amount: ${formatCurrencyFromCents(data.payment.amountCents)}`, { size: 11, font: "F2" });
  if (data.payment.note) {
    builder.addText(`Note: ${data.payment.note}`, { size: 10, maxWidth: 400 });
  }
  builder.addSpacing(8);

  builder.addText("Allocations", { font: "F2", size: 12 });
  if (data.allocations.length === 0) {
    builder.addText("Unallocated payment (will apply when invoices are open).", { size: 10 });
  } else {
    builder.addTable(
      ["Invoice", "Issued", "Status", "Allocated", "Invoice total"],
      data.allocations.map((allocation) => [
        allocation.invoiceId,
        formatDate(allocation.invoiceIssuedAt),
        allocation.invoiceStatus,
        formatCurrencyFromCents(allocation.allocatedCents),
        formatCurrencyFromCents(allocation.invoiceTotalCents),
      ]),
      [18, 18, 18, 16, 18]
    );
  }

  builder.addSpacing(6);
  builder.drawRule();
  builder.addText(
    `Allocated: ${formatCurrencyFromCents(data.totals.allocatedCents)} • Unallocated: ${formatCurrencyFromCents(
      data.totals.unallocatedCents
    )}`,
    { size: 10 }
  );

  builder.addSpacing(12);
  builder.drawRule();
  builder.addText(`Generated on ${format(new Date(), "d MMM yyyy, h:mm aaa")}`, { size: 9 });

  return builder.build();
}
