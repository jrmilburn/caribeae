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

export async function renderPaymentReceiptPdf(data: PaymentReceiptData): Promise<Buffer> {
  const builder = new PdfBuilder();

  // Header
  builder.addText(BUSINESS_NAME, { font: "F2", size: 18 });
  BUSINESS_CONTACT_LINES.forEach((line) => builder.addText(line, { size: 10 }));
  builder.addSpacing(8);
  builder.drawRule({ gapAfter: 14 });

  // Title
  builder.addText("Payment Receipt", { font: "F2", size: 15 });
  builder.addText(`Payment ID: ${data.payment.id}`, { size: 10 });
  builder.addText(`Generated: ${format(new Date(), "d MMM yyyy, h:mm aaa")}`, { size: 9 });
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

  // Payment details
  builder.addText("Payment details", { font: "F2", size: 12 });
  builder.addSpacing(4);

  builder.addText(
    `Amount: ${formatCurrencyFromCents(data.payment.amountCents)} | Paid at: ${formatDate(data.payment.paidAt)} | Method: ${
      data.payment.method ?? "—"
    }`,
    { size: 10 }
  );

  if (data.payment.note) {
    builder.addSpacing(4);
    builder.addText(`Note: ${data.payment.note}`, { size: 10 });
  }

  builder.addSpacing(14);

  // Allocation summary
  builder.addText("Allocation summary", { font: "F2", size: 12 });
  builder.addSpacing(4);
  builder.addText(`Allocated: ${formatCurrencyFromCents(data.totals.allocatedCents)}`, { size: 11 });
  builder.addText(`Unallocated: ${formatCurrencyFromCents(data.totals.unallocatedCents)}`, { size: 11, font: "F2" });

  builder.addSpacing(14);

  // Allocations table
  builder.addText("Allocations", { font: "F2", size: 12 });

  if (data.allocations.length === 0) {
    builder.addSpacing(4);
    builder.addText("No allocations recorded for this payment.", { size: 10 });
  } else {
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
      { topGap: 6 }
    );
  }

  // Footer
  builder.addSpacing(18);
  builder.drawRule({ gapAfter: 10 });
  builder.addText(`Generated on ${format(new Date(), "d MMM yyyy, h:mm aaa")}`, { size: 9 });

  return builder.build();
}
