"use server";

import type { InvoiceStatus, Prisma } from "@prisma/client";

export type BillingDashboardFilters = {
  search?: string;
  status?: InvoiceStatus | "ALL";
  startDate?: Date | null;
  endDate?: Date | null;
};

export type BillingInvoice = Prisma.InvoiceGetPayload<{
  include: {
    family: { select: { id: true; name: true } };
    allocations: {
      include: {
        payment: { select: { id: true; paidAt: true; method: true; amountCents: true } };
      };
    };
    lineItems: true;
  };
}>;

export type BillingPayment = Prisma.PaymentGetPayload<{
  include: {
    family: { select: { id: true; name: true } };
    allocations: {
      include: {
        invoice: {
          select: {
            id: true;
            amountCents: true;
            amountPaidCents: true;
            status: true;
            issuedAt: true;
            dueAt: true;
            familyId: true;
          };
        };
      };
    };
  };
}>;
