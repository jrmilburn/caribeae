"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getTeachers() {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.teacher.findMany({
    orderBy: { name: "asc" },
  });
}
