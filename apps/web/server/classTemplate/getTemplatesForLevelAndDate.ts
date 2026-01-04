"use server";

import { startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getTemplatesForLevelAndDate(levelId: string, date: Date | string) {
  await getOrCreateUser();
  await requireAdmin();

  if (!levelId) {
    throw new Error("Level is required.");
  }

  const effective = startOfDay(date instanceof Date ? date : new Date(date));
  if (Number.isNaN(effective.getTime())) {
    throw new Error("Invalid effective date.");
  }

  const templates = await prisma.classTemplate.findMany({
    where: {
      levelId,
      active: true,
      startDate: { lte: effective },
      OR: [{ endDate: null }, { endDate: { gte: effective } }],
    },
    select: { id: true },
  });

  return { count: templates.length };
}
