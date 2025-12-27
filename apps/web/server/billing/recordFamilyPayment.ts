"use server";

import { z } from "zod";
import { InvoiceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";

const allocationSchema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.number().int().positive(),
});

const recordPaymentSchema = z
  .object({
    familyId: z.string().min(1),
    amountCents: z.number().int().positive(),
    paidAt: z.coerce.date().optional(),
    method: z.string().trim().max(100).optional(),
    note: z.string().trim().max(1000).optional(),
    allocations: z.array(allocationSchema).nonempty(),
  })
  .superRefine((data, ctx) => {
    const allocationTotal = data.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    if (allocationTotal !== data.amountCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation total must equal payment amount.",
        path: ["allocations"],
      });
    }
  });

export type RecordFamilyPaymentInput = z.infer<typeof recordPaymentSchema>;

export async function recordFamilyPayment(input: RecordFamilyPaymentInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = recordPaymentSchema.parse(input);
  const paidAt = payload.paidAt ?? new Date();

  const invoiceIds = Array.from(new Set(payload.allocations.map((a) => a.invoiceId)));

  const invoices = await prisma.invoice.findMany({
    where: {
      id: { in: invoiceIds },
    },
    include: {
      enrolment: {
        include: { plan: true },
      },
    },
  });

  if (invoices.length !== invoiceIds.length) {
    throw new Error("One or more invoices not found.");
  }

  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

  const aggregatedAllocations = payload.allocations.reduce<Record<string, number>>((acc, allocation) => {
    acc[allocation.invoiceId] = (acc[allocation.invoiceId] ?? 0) + allocation.amountCents;
    return acc;
  }, {});

  Object.entries(aggregatedAllocations).forEach(([invoiceId, amountCents]) => {
    const invoice = invoiceMap.get(invoiceId);
    if (!invoice) throw new Error("Invoice missing during validation.");
    if (invoice.familyId !== payload.familyId) {
      throw new Error("Cannot allocate payments across different families.");
    }
    if (!OPEN_INVOICE_STATUSES.includes(invoice.status as (typeof OPEN_INVOICE_STATUSES)[number])) {
      throw new Error("Payments can only be applied to open invoices.");
    }
    const balance = invoice.amountCents - invoice.amountPaidCents;
    if (amountCents > balance) {
      throw new Error("Allocation exceeds the invoice balance.");
    }
  });

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        familyId: payload.familyId,
        amountCents: payload.amountCents,
        paidAt,
        method: payload.method?.trim() || undefined,
        note: payload.note?.trim() || undefined,
      },
    });

    await tx.paymentAllocation.createMany({
      data: Object.entries(aggregatedAllocations).map(([invoiceId, amountCents]) => ({
        paymentId: payment.id,
        invoiceId,
        amountCents,
      })),
    });

    for (const [invoiceId, amountCents] of Object.entries(aggregatedAllocations)) {
      const invoice = invoiceMap.get(invoiceId);
      if (!invoice) continue;
      const newAmountPaid = invoice.amountPaidCents + amountCents;
      const nowPaidInFull = newAmountPaid >= invoice.amountCents;
      const nextStatus = nowPaidInFull ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaidCents: newAmountPaid,
          status: nextStatus,
          paidAt: nowPaidInFull ? invoice.paidAt ?? paidAt : invoice.paidAt,
        },
        include: {
          enrolment: { include: { plan: true } },
        },
      });

      if (nowPaidInFull && invoice.status !== InvoiceStatus.PAID && updatedInvoice.enrolment?.plan) {
        const plan = updatedInvoice.enrolment.plan;
        if (plan.billingType === "PER_WEEK" && updatedInvoice.coverageEnd) {
          await tx.enrolment.update({
            where: { id: updatedInvoice.enrolment.id },
            data: { paidThroughDate: updatedInvoice.coverageEnd },
          });
        } else if (
          (plan.billingType === "BLOCK" || plan.billingType === "PER_CLASS") &&
          updatedInvoice.creditsPurchased
        ) {
          await tx.enrolment.update({
            where: { id: updatedInvoice.enrolment.id },
            data: {
              creditsRemaining:
                (updatedInvoice.enrolment.creditsRemaining ?? 0) + updatedInvoice.creditsPurchased,
            },
          });
        }
      }
    }

    return payment;
  });
}
