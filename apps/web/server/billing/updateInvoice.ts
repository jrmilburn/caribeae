"use server";

import { addDays } from "date-fns";
import { InvoiceStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const updateInvoiceSchema = z.object({
  familyId: z.string().min(1).optional(),
  enrolmentId: z.string().optional().nullable(),
  amountCents: z.number().int().positive().optional(),
  amountPaidCents: z.number().int().min(0).optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  issuedAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional().nullable(),
  paidAt: z.coerce.date().optional().nullable(),
  coverageStart: z.coerce.date().optional().nullable(),
  coverageEnd: z.coerce.date().optional().nullable(),
  creditsPurchased: z.number().int().optional().nullable(),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export async function updateInvoice(invoiceId: string, input: UpdateInvoiceInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = updateInvoiceSchema.parse(input);

  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (!existing) {
    throw new Error("Invoice not found.");
  }

  const amountCents = payload.amountCents ?? existing.amountCents;
  const issuedAt = payload.issuedAt ?? existing.issuedAt ?? new Date();
  const dueAt = payload.dueAt ?? existing.dueAt ?? addDays(issuedAt, 7);

  let amountPaidCents = payload.amountPaidCents ?? existing.amountPaidCents;
  if (payload.status === InvoiceStatus.PAID || existing.status === InvoiceStatus.PAID) {
    amountPaidCents = Math.min(amountCents, Math.max(amountPaidCents, amountCents));
  } else {
    amountPaidCents = Math.min(amountPaidCents, amountCents);
  }

  const status = payload.status ?? existing.status;

  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      familyId: payload.familyId ?? existing.familyId,
      enrolmentId: payload.enrolmentId ?? existing.enrolmentId ?? undefined,
      amountCents,
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
}
