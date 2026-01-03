"use server";

import { InvoiceStatus, PaymentStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

// Audit + integration plan:
// - Payments appear in Billing dashboards (PaymentTable) and family billing summaries with allocations mapped per invoice.
// - Invoice + allocation data is already fetched with Prisma includes; currency helpers live in lib/currency; auth gates run through getOrCreateUser + requireAdmin.
// - Payment receipts will reuse these shapes (payment + family + allocated invoices with their totals) to feed PDF renderers and /admin/payment/[id]/receipt routes without N+1 queries.

const paramsSchema = z.object({
  paymentId: z.string().min(1),
});

type PaymentForReceipt = Awaited<ReturnType<typeof fetchPayment>>;

async function fetchPayment(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      family: {
        select: {
          id: true,
          name: true,
          primaryEmail: true,
          primaryContactName: true,
          primaryPhone: true,
        },
      },
      allocations: {
        include: {
          invoice: {
            select: {
              id: true,
              status: true,
              issuedAt: true,
              amountCents: true,
              amountPaidCents: true,
              lineItems: {
                select: { amountCents: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export type PaymentReceiptData = {
  payment: {
    id: string;
    amountCents: number;
    paidAt: Date | null;
    method?: string | null;
    note?: string | null;
  };
  family: NonNullable<PaymentForReceipt>["family"];
  allocations: Array<{
    invoiceId: string;
    allocatedCents: number;
    invoiceIssuedAt: Date | null;
    invoiceStatus: InvoiceStatus | "UNKNOWN";
    invoiceTotalCents: number;
  }>;
  totals: {
    allocatedCents: number;
    unallocatedCents: number;
  };
};

export async function getPaymentReceiptData(rawPaymentId: string): Promise<PaymentReceiptData | null> {
  await getOrCreateUser();
  await requireAdmin();

  const { paymentId } = paramsSchema.parse({ paymentId: rawPaymentId });
  const payment = await fetchPayment(paymentId);
  if (!payment) return null;
  if (payment.status === PaymentStatus.VOID) {
    throw new Error("This payment has been voided and cannot be receipted.");
  }

  const allocations = payment.allocations.map((allocation) => {
    const totalFromItems =
      allocation.invoice?.lineItems.reduce((sum, item) => sum + item.amountCents, 0) ?? 0;
    const invoiceTotal = totalFromItems > 0 ? totalFromItems : allocation.invoice?.amountCents ?? 0;

    return {
      invoiceId: allocation.invoiceId,
      allocatedCents: allocation.amountCents,
      invoiceIssuedAt: allocation.invoice?.issuedAt ?? null,
      invoiceStatus: allocation.invoice?.status ?? "UNKNOWN",
      invoiceTotalCents: invoiceTotal,
    };
  });

  const allocatedCents = allocations.reduce((sum, a) => sum + a.allocatedCents, 0);
  const unallocatedCents = Math.max(payment.amountCents - allocatedCents, 0);

  return {
    payment: {
      id: payment.id,
      amountCents: payment.amountCents,
      paidAt: payment.paidAt,
      method: payment.method,
      note: payment.note,
    },
    family: payment.family,
    allocations,
    totals: {
      allocatedCents,
      unallocatedCents,
    },
  };
}
