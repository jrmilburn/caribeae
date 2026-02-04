"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const schema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export async function reorderProductCategories(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);

  await prisma.$transaction(
    payload.orderedIds.map((id, index) =>
      prisma.productCategory.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  revalidatePath("/admin/settings/products");
  revalidatePath("/admin/reception/pos");

  return { success: true };
}
