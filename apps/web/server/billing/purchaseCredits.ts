"use server";

import { addDays } from "date-fns";
import { BillingType, InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInvoiceWithLineItems } from "./invoiceMutations";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";

const inputSchema = z.object({
  enrolmentId: z.string().min(1),
  blocks: z.number().int().positive().max(50).optional(),
});

export type PurchaseCreditsInput = z.infer<typeof inputSchema>;

export async function purchaseCredits(input: PurchaseCreditsInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = inputSchema.parse(input);
  const blocks = payload.blocks ?? 1;

  const enrolment = await prisma.enrolment.findUnique({
    where: { id: payload.enrolmentId },
    include: {
      plan: true,
      student: { select: { familyId: true } },
      template: { select: { dayOfWeek: true, name: true } },
    },
  });

  if (!enrolment) throw new Error("Enrolment not found.");
  if (!enrolment.plan) throw new Error("Enrolment plan missing.");
  if (!enrolment.template) throw new Error("Class template missing for enrolment.");
  assertPlanMatchesTemplate(enrolment.plan, enrolment.template);
  if (enrolment.plan.billingType === BillingType.PER_WEEK) {
    throw new Error("Use the weekly pay-ahead flow for this enrolment.");
  }

  const blockSize = enrolment.plan.blockClassCount ?? 1;

  if (!blockSize || blockSize <= 0) {
    throw new Error("Plan is missing block or class count details.");
  }

  const creditsPurchased = blockSize * blocks;
  const amountCents = enrolment.plan.priceCents * blocks;
  const issuedAt = new Date();
  const dueAt = addDays(issuedAt, 7);

  const invoice = await createInvoiceWithLineItems({
    familyId: enrolment.student.familyId,
    enrolmentId: enrolment.id,
    lineItems: [
      {
        kind: InvoiceLineItemKind.ENROLMENT,
        description: enrolment.plan.name,
        quantity: blocks,
        unitPriceCents: enrolment.plan.priceCents,
        amountCents,
      },
    ],
    status: InvoiceStatus.SENT,
    creditsPurchased,
    issuedAt,
    dueAt,
  });

  return { invoice, creditsPurchased };
}
