"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const schema = z.object({
  productId: z.string().min(1),
  mode: z.enum(["adjust", "set"]),
  quantity: z.number().int(),
});

export async function updateProductStock(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);

  if (payload.mode === "set" && payload.quantity < 0) {
    throw new Error("Stock count must be zero or more.");
  }

  const product = await prisma.product.update({
    where: { id: payload.productId },
    data:
      payload.mode === "set"
        ? { stockOnHand: payload.quantity }
        : { stockOnHand: { increment: payload.quantity } },
  });

  revalidatePath("/admin/settings/products");
  revalidatePath("/admin/reception/pos");

  return product;
}
