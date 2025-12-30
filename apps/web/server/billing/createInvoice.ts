"use server";
import { InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";
import { z } from "zod";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInvoiceWithLineItems } from "./invoiceMutations";

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

const invoiceSchema = z.object({
  familyId: z.string().min(1),
  enrolmentId: z.string().optional().nullable(),
  lineItems: z.array(lineItemSchema).nonempty(),
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

  const invoice = await createInvoiceWithLineItems({
    familyId: payload.familyId,
    enrolmentId: payload.enrolmentId ?? null,
    lineItems: payload.lineItems,
    status: payload.status ?? InvoiceStatus.DRAFT,
    issuedAt: payload.issuedAt,
    dueAt: payload.dueAt ?? undefined,
    coverageStart: payload.coverageStart ?? null,
    coverageEnd: payload.coverageEnd ?? null,
    creditsPurchased: payload.creditsPurchased ?? null,
    skipAuth: true,
  });

  return invoice;
}
