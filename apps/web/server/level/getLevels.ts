"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getLevels() {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.level.findMany({
    orderBy: [{ levelOrder: "asc" }, { name: "asc" }],
  });
}
