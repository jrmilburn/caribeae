"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const schema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  priceCents: z.number().int().min(0).optional(),
  sku: z.string().trim().max(64).optional().nullable(),
  barcode: z.string().trim().max(64).optional().nullable(),
  trackInventory: z.boolean().optional(),
  stockOnHand: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function updateProduct(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);

  const sku = payload.sku?.trim() || null;
  const barcode = payload.barcode?.trim() || null;

  if (sku) {
    const existing = await prisma.product.findFirst({
      where: { sku, NOT: { id: payload.id } },
    });
    if (existing) throw new Error("SKU already in use.");
  }

  if (barcode) {
    const existing = await prisma.product.findFirst({
      where: { barcode, NOT: { id: payload.id } },
    });
    if (existing) throw new Error("Barcode already in use.");
  }

  let sortOrder: number | undefined;
  if (payload.categoryId) {
    const last = await prisma.product.findFirst({
      where: { categoryId: payload.categoryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }

  const data: Record<string, unknown> = {};
  if (payload.categoryId) data.categoryId = payload.categoryId;
  if (payload.name) data.name = payload.name.trim();
  if (typeof payload.priceCents === "number") data.priceCents = payload.priceCents;
  if (payload.sku !== undefined) data.sku = sku;
  if (payload.barcode !== undefined) data.barcode = barcode;
  if (typeof payload.trackInventory === "boolean") data.trackInventory = payload.trackInventory;
  if (typeof payload.stockOnHand === "number") data.stockOnHand = payload.stockOnHand;
  if (payload.lowStockThreshold !== undefined) data.lowStockThreshold = payload.lowStockThreshold ?? null;
  if (typeof payload.isActive === "boolean") data.isActive = payload.isActive;
  if (typeof sortOrder === "number") data.sortOrder = sortOrder;

  if (Object.keys(data).length === 0) {
    throw new Error("No changes provided.");
  }

  const product = await prisma.product.update({
    where: { id: payload.id },
    data,
  });

  revalidatePath("/admin/settings/products");
  revalidatePath("/admin/reception/pos");

  return product;
}
