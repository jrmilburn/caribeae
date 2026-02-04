"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const schema = z.object({
  categoryId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
});

export async function reorderProducts(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);

  await prisma.$transaction(
    payload.orderedIds.map((id, index) =>
      prisma.product.update({
        where: { id },
        data: { sortOrder: index, categoryId: payload.categoryId },
      })
    )
  );

  revalidatePath("/admin/settings/products");
  revalidatePath("/admin/reception/pos");

  return { success: true };
}
