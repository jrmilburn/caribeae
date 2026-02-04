"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { calculateTaxCents } from "@/lib/pos/config";

const lineItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const schema = z.object({
  items: z.array(lineItemSchema).min(1),
  discountCents: z.number().int().min(0).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
  paymentMethod: z.enum(["CASH", "CARD", "OTHER"]),
});

export async function createPosSale(input: z.infer<typeof schema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);

  const productIds = payload.items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
  });

  if (products.length !== productIds.length) {
    throw new Error("One or more products are unavailable.");
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const lineItems = payload.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error("Product not found.");
    const lineTotal = product.priceCents * item.quantity;
    return {
      productId: product.id,
      nameSnapshot: product.name,
      priceCentsSnapshot: product.priceCents,
      quantity: item.quantity,
      lineTotalCents: lineTotal,
      trackInventory: product.trackInventory,
    };
  });

  const subtotalCents = lineItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const discountCents = Math.min(payload.discountCents ?? 0, subtotalCents);
  const taxCents = calculateTaxCents(subtotalCents - discountCents);
  const totalCents = subtotalCents - discountCents + taxCents;

  const now = new Date();

  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.posSale.create({
      data: {
        status: "COMPLETED",
        subtotalCents,
        discountCents,
        totalCents,
        notes: payload.notes?.trim() || null,
        createdByUserId: user.id,
        completedAt: now,
        lineItems: {
          create: lineItems.map((item) => ({
            productId: item.productId,
            nameSnapshot: item.nameSnapshot,
            priceCentsSnapshot: item.priceCentsSnapshot,
            quantity: item.quantity,
            lineTotalCents: item.lineTotalCents,
          })),
        },
        payments: {
          create: {
            method: payload.paymentMethod,
            amountCents: totalCents,
          },
        },
      },
      include: { lineItems: true, payments: true },
    });

    await Promise.all(
      lineItems.map((item) => {
        if (!item.trackInventory) return Promise.resolve();
        return tx.product.update({
          where: { id: item.productId },
          data: { stockOnHand: { decrement: item.quantity } },
        });
      })
    );

    return created;
  });

  revalidatePath("/admin/reception/pos");
  revalidatePath("/admin/settings/products");

  return sale;
}
