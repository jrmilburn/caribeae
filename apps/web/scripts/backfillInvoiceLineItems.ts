/**
 * Backfill legacy invoices into InvoiceLineItem rows.
 * Run with: pnpm tsx scripts/backfillInvoiceLineItems.ts
 */
import { InvoiceLineItemKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { recalculateInvoiceTotals } from "@/server/billing/invoiceMutations";

async function main() {
  const invoices = await prisma.invoice.findMany({
    include: { lineItems: true },
  });

  let created = 0;

  for (const invoice of invoices) {
    if (invoice.lineItems.length > 0) {
      continue;
    }

    await prisma.invoiceLineItem.create({
      data: {
        invoiceId: invoice.id,
        kind: InvoiceLineItemKind.ADJUSTMENT,
        description: "Legacy invoice total",
        quantity: 1,
        unitPriceCents: invoice.amountCents,
        amountCents: invoice.amountCents,
      },
    });
    await recalculateInvoiceTotals(invoice.id, { skipAuth: true });
    created += 1;
  }

  console.log(`Backfill complete. Added line items to ${created} invoices.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
