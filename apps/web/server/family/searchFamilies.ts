"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function searchFamilies(query: string) {
  await getOrCreateUser();
  await requireAdmin();

  const term = query.trim();
  if (!term) return [];

  return prisma.family.findMany({
    where: {
      name: { contains: term, mode: "insensitive" },
    },
    select: { id: true, name: true, primaryContactName: true, primaryPhone: true },
    orderBy: [{ name: "asc" }],
    take: 15,
  });
}
