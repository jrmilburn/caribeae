"use server";

import { addDays } from "date-fns";
import { InvoiceStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const invoiceSchema = z.object({
  familyId: z.string().min(1),
  enrolmentId: z.string().optional().nullable(),
  amountCents: z.number().int().positive(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  issuedAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional().nullable(),
  coverageStart: z.coerce.date().optional().nullable(),
  coverageEnd: z.coerce.date().optional().nullable(),
  creditsPurchased: z.number().int().optional().nullable(),
});

export type CreateInvoiceInput = z.infer<typeof invoiceSchema>;

export async function createInvoice(input: CreateInvoiceInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = invoiceSchema.parse(input);

  const issuedAt = payload.issuedAt ?? new Date();
  const dueAt = payload.dueAt ?? addDays(issuedAt, 7);

  const invoice = await prisma.invoice.create({
    data: {
      familyId: payload.familyId,
      enrolmentId: payload.enrolmentId ?? undefined,
      amountCents: payload.amountCents,
      amountPaidCents: 0,
      status: payload.status ?? InvoiceStatus.DRAFT,
      issuedAt,
      dueAt,
      coverageStart: payload.coverageStart ?? null,
      coverageEnd: payload.coverageEnd ?? null,
      creditsPurchased: payload.creditsPurchased ?? null,
    },
  });

  return invoice;
}
