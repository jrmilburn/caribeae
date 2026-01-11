"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getAccountOpeningState(familyId: string) {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.accountOpeningState.findUnique({
    where: { familyId },
    select: { id: true, createdAt: true },
  });
}
