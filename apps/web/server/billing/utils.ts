
import { isBefore } from "date-fns";
import { BillingType, InvoiceLineItemKind, InvoiceStatus, Prisma } from "@prisma/client";

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
    include: {
      enrolment: { include: { plan: true } },
      lineItems: { select: { kind: true } },
      _count: { select: { lineItems: true } },
    },
  });

  if (!invoice) throw new Error("Invoice not found");
  const nextPaid = Math.max(invoice.amountPaidCents + deltaCents, 0);
  const status = nextInvoiceStatus({ invoice, paidCents: nextPaid });

  const updated = await tx.invoice.update({
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

  const hasEnrolmentLineItem =
    (invoice._count?.lineItems ?? 0) === 0
      ? false
      : invoice.lineItems.some((li) => li.kind === InvoiceLineItemKind.ENROLMENT);
  if (
    status === InvoiceStatus.PAID &&
    invoice.status !== InvoiceStatus.PAID &&
    hasEnrolmentLineItem &&
    invoice.enrolment?.plan
  ) {
    const plan = invoice.enrolment.plan;
    if (plan.billingType === BillingType.PER_WEEK && invoice.coverageEnd) {
      await tx.enrolment.update({
        where: { id: invoice.enrolment.id },
        data: { paidThroughDate: invoice.coverageEnd },
      });
    } else if (
      (plan.billingType === BillingType.BLOCK || plan.billingType === BillingType.PER_CLASS) &&
      invoice.creditsPurchased
    ) {
      await tx.enrolment.update({
        where: { id: invoice.enrolment.id },
        data: {
          creditsRemaining: (invoice.enrolment.creditsRemaining ?? 0) + invoice.creditsPurchased,
        },
      });
    }
  }

  return updated;
}
