
import { isBefore } from "date-fns";
import { InvoiceStatus, Prisma } from "@prisma/client";

export function nextInvoiceStatus(params: {
  invoice: { status: InvoiceStatus; amountCents: number; dueAt: Date | null; issuedAt: Date | null };
  paidCents: number;
}) {
  const { invoice, paidCents } = params;

  if (invoice.status === InvoiceStatus.VOID) {
    return InvoiceStatus.VOID;
  }

  if (paidCents >= invoice.amountCents) {
    return InvoiceStatus.PAID;
  }

  const now = new Date();
  const isOverdue = invoice.dueAt ? isBefore(invoice.dueAt, now) : false;
  if (paidCents > 0) {
    return InvoiceStatus.PARTIALLY_PAID;
  }

  if (invoice.status === InvoiceStatus.DRAFT) {
    return InvoiceStatus.DRAFT;
  }

  if (isOverdue) return InvoiceStatus.OVERDUE;

  return InvoiceStatus.SENT;
}

export async function adjustInvoicePayment(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  deltaCents: number,
  paidAtHint?: Date | null
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      amountCents: true,
      amountPaidCents: true,
      status: true,
      dueAt: true,
      issuedAt: true,
      paidAt: true,
    },
  });

  if (!invoice) throw new Error("Invoice not found");
  const nextPaid = Math.max(invoice.amountPaidCents + deltaCents, 0);
  const status = nextInvoiceStatus({ invoice, paidCents: nextPaid });

  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaidCents: nextPaid,
      status,
      paidAt:
        status === InvoiceStatus.PAID
          ? invoice.paidAt ?? paidAtHint ?? new Date()
          : status === InvoiceStatus.VOID
            ? invoice.paidAt
            : null,
    },
  });
}
