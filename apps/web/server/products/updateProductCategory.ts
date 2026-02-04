"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const schema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

export async function updateProductCategory(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);
  if (!payload.name && typeof payload.isActive !== "boolean") {
    throw new Error("No changes provided.");
  }

  const data: { name?: string; isActive?: boolean } = {};
  if (payload.name) data.name = payload.name.trim();
  if (typeof payload.isActive === "boolean") data.isActive = payload.isActive;

  const category = await prisma.productCategory.update({
    where: { id: payload.id },
    data,
  });

  revalidatePath("/admin/settings/products");
  revalidatePath("/admin/reception/pos");

  return category;
}
