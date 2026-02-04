"use server";

import { addDays } from "date-fns";
import { InvoiceLineItemKind, InvoiceStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createInvoiceWithLineItems, createPaymentAndAllocate } from "./invoiceMutations";

const checkoutSchema = z.object({
  familyId: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .nonempty(),
  payNow: z.boolean().optional(),
  paymentMethod: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});

async function getCounterSaleFamilyId() {
  const configured = process.env.COUNTER_SALE_FAMILY_ID;
  if (configured) return configured;

  const name = process.env.COUNTER_SALE_FAMILY_NAME ?? "Counter Sale";
  const existing = await prisma.family.findFirst({ where: { name } });
  if (existing) return existing.id;

  const created = await prisma.family.create({
    data: { name },
  });
  return created.id;
}

export async function createCounterInvoice(input: z.infer<typeof checkoutSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = checkoutSchema.parse(input);

  const familyId = payload.familyId ?? (await getCounterSaleFamilyId());
  const productIds = payload.items.map((item) => item.productId);

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
  });

  if (products.length !== productIds.length) {
    throw new Error("One or more products are unavailable.");
  }

  const quantityByProduct = new Map(payload.items.map((item) => [item.productId, item.quantity]));

  const lineItems = products.map((product) => {
    const qty = quantityByProduct.get(product.id) ?? 1;
    return {
      kind: InvoiceLineItemKind.PRODUCT,
      description: product.name,
      quantity: qty,
      unitPriceCents: product.priceCents,
      amountCents: product.priceCents * qty,
      productId: product.id,
    };
  });

  const issuedAt = new Date();
  const dueAt = addDays(issuedAt, 7);

  const invoice = await createInvoiceWithLineItems({
    familyId,
    lineItems,
    status: InvoiceStatus.SENT,
    issuedAt,
    dueAt,
    skipAuth: true,
  });

  if (payload.payNow) {
    await createPaymentAndAllocate({
      familyId,
      amountCents: invoice.amountCents,
      paidAt: issuedAt,
      method: payload.paymentMethod,
      note: payload.note,
      allocations: [{ invoiceId: invoice.id, amountCents: invoice.amountCents }],
      skipAuth: true,
    });
  }

  return { invoice, familyId };
}

export async function getCounterSaleFamily() {
  await getOrCreateUser();
  await requireAdmin();
  const id = await getCounterSaleFamilyId();
  const family = await prisma.family.findUnique({ where: { id } });
  return family;
}
