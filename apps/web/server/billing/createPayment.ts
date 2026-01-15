"use server";

import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { allocatePaymentOldestOpenInvoices, createPaymentAndAllocate } from "./invoiceMutations";
import { recordPayment } from "@/server/billing/payments/recordPayment";

const allocationSchema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.number().int().positive(),
});

const paymentSchema = z
  .object({
    familyId: z.string().min(1),
    amountCents: z.number().int().positive(),
    paidAt: z.coerce.date().optional(),
    method: z.string().trim().max(100).optional(),
    note: z.string().trim().max(1000).optional(),
    allocations: z.array(allocationSchema).optional(),
    allocationMode: z.enum(["AUTO", "MANUAL"]).optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
    enrolmentId: z.string().min(1).optional(),
    customBlockLength: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    const mode = data.allocationMode ?? "MANUAL";
    if (data.enrolmentId) return;
    if (mode === "AUTO" || !data.allocations || data.allocations.length === 0) return;
    const allocationTotal = data.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    if (allocationTotal !== data.amountCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation total must equal payment amount.",
        path: ["allocations"],
      });
    }
  });

export type CreatePaymentInput = z.infer<typeof paymentSchema>;

export async function createPayment(input: CreatePaymentInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = paymentSchema.parse(input);
  if (payload.enrolmentId) {
    const result = await recordPayment({
      familyId: payload.familyId,
      amountCents: payload.amountCents,
      paidAt: payload.paidAt,
      method: payload.method,
      note: payload.note,
      enrolmentId: payload.enrolmentId,
      customBlockLength: payload.customBlockLength,
      idempotencyKey: payload.idempotencyKey,
    });
    return {
      payment: result.payment,
      allocations: [],
      allocatedCents: result.payment.amountCents,
      unallocatedCents: 0,
      receiptInvoiceId: result.receiptInvoiceId,
    };
  }
  const strategy = payload.allocationMode === "AUTO" ? "oldest-open-first" : undefined;

  const allocations =
    payload.allocationMode === "MANUAL" && payload.allocations?.length ? payload.allocations : undefined;

  return createPaymentAndAllocate({
    familyId: payload.familyId,
    amountCents: payload.amountCents,
    paidAt: payload.paidAt,
    method: payload.method,
    note: payload.note,
    allocations,
    strategy,
    idempotencyKey: payload.idempotencyKey,
    skipAuth: true,
  });
}

export async function autoAllocatePayment(paymentId: string) {
  await getOrCreateUser();
  await requireAdmin();
  return allocatePaymentOldestOpenInvoices(paymentId);
}
