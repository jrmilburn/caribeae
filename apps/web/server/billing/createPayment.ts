"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

import { adjustInvoicePayment } from "./utils";

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
  })
  .superRefine((data, ctx) => {
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

export type CreatePaymentInput = z.infer<typeof paymentSchema>;

export async function createPayment(input: CreatePaymentInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = paymentSchema.parse(input);
  const paidAt = payload.paidAt ?? new Date();

  const allocations = payload.allocations ?? [];
  const invoiceIds = Array.from(new Set(allocations.map((a) => a.invoiceId)));
  const aggregated = allocations.reduce<Record<string, number>>((acc, a) => {
    acc[a.invoiceId] = (acc[a.invoiceId] ?? 0) + a.amountCents;
    return acc;
  }, {});

  if (invoiceIds.length > 0) {
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      select: { id: true, familyId: true, status: true, amountCents: true, amountPaidCents: true },
    });
    if (invoices.length !== invoiceIds.length) {
      throw new Error("One or more invoices could not be found.");
    }
    invoices.forEach((inv) => {
      if (inv.familyId !== payload.familyId) {
        throw new Error("Payment allocations must belong to the same family.");
      }
      if (inv.status === "VOID") {
        throw new Error("Cannot allocate payments to void invoices.");
      }
      const allocAmount = aggregated[inv.id] ?? 0;
      const balance = inv.amountCents - inv.amountPaidCents;
      if (allocAmount > balance) {
        throw new Error("Allocation exceeds the invoice balance.");
      }
    });
  }

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

    if (allocations.length > 0) {
      await tx.paymentAllocation.createMany({
        data: Object.entries(aggregated).map(([invoiceId, amountCents]) => ({
          paymentId: payment.id,
          invoiceId,
          amountCents,
        })),
      });

      for (const [invoiceId, amountCents] of Object.entries(aggregated)) {
        await adjustInvoicePayment(tx, invoiceId, amountCents, paidAt);
      }
    }

    return payment;
  });
}
