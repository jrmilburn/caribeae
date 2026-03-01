"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getSkills() {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.skill.findMany({
    include: {
      level: {
        select: {
          id: true,
          name: true,
          levelOrder: true,
        },
      },
    },
    orderBy: [{ level: { levelOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });
}
