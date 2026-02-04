"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const schema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  priceCents: z.number().int().min(0),
  sku: z.string().trim().max(64).optional().nullable(),
  barcode: z.string().trim().max(64).optional().nullable(),
  trackInventory: z.boolean().optional(),
  stockOnHand: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function createProduct(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);

  const sku = payload.sku?.trim() || null;
  const barcode = payload.barcode?.trim() || null;

  if (sku) {
    const existing = await prisma.product.findFirst({ where: { sku } });
    if (existing) throw new Error("SKU already in use.");
  }

  if (barcode) {
    const existing = await prisma.product.findFirst({ where: { barcode } });
    if (existing) throw new Error("Barcode already in use.");
  }

  const last = await prisma.product.findFirst({
    where: { categoryId: payload.categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const product = await prisma.product.create({
    data: {
      categoryId: payload.categoryId,
      name: payload.name.trim(),
      priceCents: payload.priceCents,
      sku,
      barcode,
      trackInventory: payload.trackInventory ?? true,
      stockOnHand: payload.stockOnHand ?? 0,
      lowStockThreshold: payload.lowStockThreshold ?? null,
      isActive: payload.isActive ?? true,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/admin/settings/products");
  revalidatePath("/admin/reception/pos");

  return product;
}
