"use server";

import { addDays } from "date-fns";
import { InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { recalculateInvoiceTotals, replaceInvoiceLineItems } from "./invoiceMutations";
import { applyPaidInvoiceToEnrolment } from "@/server/invoicing/applyPaidInvoiceToEnrolment";

const lineItemSchema = z.object({
  kind: z.nativeEnum(InvoiceLineItemKind),
  description: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  unitPriceCents: z.number().int(),
  amountCents: z.number().int().optional(),
  productId: z.string().optional().nullable(),
  enrolmentId: z.string().optional().nullable(),
  studentId: z.string().optional().nullable(),
});

const updateInvoiceSchema = z.object({
  familyId: z.string().min(1).optional(),
  enrolmentId: z.string().optional().nullable(),
  amountPaidCents: z.number().int().min(0).optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  issuedAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional().nullable(),
  paidAt: z.coerce.date().optional().nullable(),
  coverageStart: z.coerce.date().optional().nullable(),
  coverageEnd: z.coerce.date().optional().nullable(),
  creditsPurchased: z.number().int().optional().nullable(),
  lineItems: z.array(lineItemSchema).optional(),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export async function updateInvoice(invoiceId: string, input: UpdateInvoiceInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = updateInvoiceSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!existing) {
      throw new Error("Invoice not found.");
    }

    const issuedAt = payload.issuedAt ?? existing.issuedAt ?? new Date();
    const dueAt = payload.dueAt ?? existing.dueAt ?? addDays(issuedAt, 7);

    if (payload.lineItems) {
      await replaceInvoiceLineItems({
        invoiceId,
        lineItems: payload.lineItems,
        client: tx,
        skipAuth: true,
      });
    }

    const recalculated = await recalculateInvoiceTotals(invoiceId, { client: tx, skipAuth: true });

    let amountPaidCents = payload.amountPaidCents ?? recalculated.amountPaidCents;
    amountPaidCents = Math.max(Math.min(amountPaidCents, recalculated.amountCents), 0);

    const status =
      payload.status ??
      (recalculated.status === InvoiceStatus.VOID
        ? InvoiceStatus.VOID
        : amountPaidCents >= recalculated.amountCents
          ? InvoiceStatus.PAID
          : recalculated.status === InvoiceStatus.DRAFT
            ? InvoiceStatus.DRAFT
            : recalculated.status === InvoiceStatus.OVERDUE
              ? InvoiceStatus.OVERDUE
              : amountPaidCents > 0
                ? InvoiceStatus.PARTIALLY_PAID
                : InvoiceStatus.SENT);

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        familyId: payload.familyId ?? existing.familyId,
        enrolmentId: payload.enrolmentId ?? existing.enrolmentId ?? undefined,
        amountPaidCents,
        status,
        issuedAt,
        dueAt,
        paidAt:
          status === InvoiceStatus.PAID
            ? payload.paidAt ?? existing.paidAt ?? new Date()
            : status === InvoiceStatus.VOID
              ? existing.paidAt
              : null,
        coverageStart: payload.coverageStart ?? existing.coverageStart,
        coverageEnd: payload.coverageEnd ?? existing.coverageEnd,
        creditsPurchased:
          payload.creditsPurchased !== undefined ? payload.creditsPurchased : existing.creditsPurchased,
      },
    });

    if (status === InvoiceStatus.PAID && existing.status !== InvoiceStatus.PAID) {
      await applyPaidInvoiceToEnrolment(invoiceId, { client: tx });
    }

    return recalculateInvoiceTotals(invoiceId, { client: tx, skipAuth: true });
  });
}
