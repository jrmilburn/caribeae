"use server";

import { InvoiceStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

// Audit + integration plan:
// - Invoice data is surfaced via the billing dashboard (InvoiceTable), family billing view (FamilyInvoices accordion with line items + allocations), and payment tables.
// - Currency helpers live in lib/currency; admin protection consistently flows through getOrCreateUser + requireAdmin.
// - Receipts will reuse the same invoice + allocation shapes with Prisma includes (family + line items + payment allocations) to avoid N+1s, and expose typed DTOs for PDF renderers and /admin/.../receipt routes.

const paramsSchema = z.object({
  invoiceId: z.string().min(1),
});

type InvoiceForReceipt = Prisma.InvoiceGetPayload<{
  include: {
    family: {
      select: {
        id: true;
        name: true;
        primaryEmail: true;
        primaryContactName: true;
        primaryPhone: true;
      };
    };
    allocations: {
      include: {
        payment: {
          select: {
            id: true;
            paidAt: true;
            method: true;
            amountCents: true;
            familyId: true;
          };
        };
      };
    };
    lineItems: true;
  };
}>;

export type InvoiceReceiptData = {
  invoice: Pick<
    InvoiceForReceipt,
    | "id"
    | "status"
    | "issuedAt"
    | "dueAt"
    | "paidAt"
    | "coverageStart"
    | "coverageEnd"
    | "creditsPurchased"
  > & {
    amountPaidCents: number;
  };
  family: InvoiceForReceipt["family"];
  lineItems: InvoiceForReceipt["lineItems"];
  allocations: Array<{
    paymentId: string;
    amountCents: number;
    paidAt: Date | null;
    method?: string | null;
    paymentAmountCents: number;
  }>;
  totals: {
    totalCents: number;
    paidCents: number;
    balanceCents: number;
    allocatedCents: number;
  };
};

export async function getInvoiceReceiptData(rawInvoiceId: string): Promise<InvoiceReceiptData | null> {
  await getOrCreateUser();
  await requireAdmin();

  const { invoiceId } = paramsSchema.parse({ invoiceId: rawInvoiceId });

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
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
          payment: {
            select: {
              id: true,
              paidAt: true,
              method: true,
              amountCents: true,
              familyId: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      lineItems: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!invoice) return null;

  const totalCentsFromItems = invoice.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const totalCents = totalCentsFromItems > 0 ? totalCentsFromItems : invoice.amountCents;

  const allocatedCents = invoice.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  const paidCents =
    invoice.status === InvoiceStatus.VOID
      ? 0
      : Math.max(invoice.amountPaidCents, allocatedCents, 0);
  const balanceCents = Math.max(totalCents - paidCents, 0);

  return {
    invoice: {
      id: invoice.id,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      coverageStart: invoice.coverageStart,
      coverageEnd: invoice.coverageEnd,
      creditsPurchased: invoice.creditsPurchased,
      amountPaidCents: paidCents,
    },
    family: invoice.family,
    lineItems: invoice.lineItems,
    allocations: invoice.allocations.map((allocation) => ({
      paymentId: allocation.paymentId,
      amountCents: allocation.amountCents,
      paidAt: allocation.payment?.paidAt ?? null,
      method: allocation.payment?.method ?? null,
      paymentAmountCents: allocation.payment?.amountCents ?? allocation.amountCents,
    })),
    totals: {
      totalCents,
      paidCents,
      balanceCents,
      allocatedCents,
    },
  };
}
