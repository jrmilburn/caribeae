"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const schema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        count: z.number().int().min(0),
      })
    )
    .min(1),
});

export async function stocktakeProducts(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);

  await prisma.$transaction(
    payload.items.map((item) =>
      prisma.product.update({
        where: { id: item.productId },
        data: { stockOnHand: item.count },
      })
    )
  );

  revalidatePath("/admin/settings/products");
  revalidatePath("/admin/reception/pos");

  return { success: true };
}
