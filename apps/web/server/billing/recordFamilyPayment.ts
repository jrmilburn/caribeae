"use server";

import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createPaymentAndAllocate } from "./invoiceMutations";

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

  return createPaymentAndAllocate({
    familyId: payload.familyId,
    amountCents: payload.amountCents,
    allocations: payload.allocations,
    paidAt: payload.paidAt,
    method: payload.method,
    note: payload.note,
    skipAuth: true,
  }).then((res) => res.payment);
}
