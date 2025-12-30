"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getActiveProducts() {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
}
