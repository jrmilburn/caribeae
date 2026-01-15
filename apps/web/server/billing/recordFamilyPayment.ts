"use server";

import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createPaymentAndAllocate } from "./invoiceMutations";
import { recordPayment } from "@/server/billing/payments/recordPayment";

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
    allocations: z.array(allocationSchema).optional(),
    enrolmentId: z.string().min(1).optional(),
    customBlockLength: z.number().int().positive().optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.enrolmentId) return;
    if (!data.allocations || data.allocations.length === 0) return;
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
    return result.payment;
  }

  return createPaymentAndAllocate({
    familyId: payload.familyId,
    amountCents: payload.amountCents,
    allocations: payload.allocations ?? [],
    paidAt: payload.paidAt,
    method: payload.method,
    note: payload.note,
    idempotencyKey: payload.idempotencyKey,
    skipAuth: true,
  }).then((res) => res.payment);
}
