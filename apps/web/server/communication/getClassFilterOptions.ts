"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export type ClassFilterOption = {
  id: string;
  name: string | null;
  dayOfWeek: number | null;
  startTime: number | null;
  endTime: number | null;
  active: boolean;
  levelName: string | null;
};

export async function getClassFilterOptions(): Promise<ClassFilterOption[]> {
  await getOrCreateUser();
  await requireAdmin();

  const templates = await prisma.classTemplate.findMany({
    select: {
      id: true,
      name: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      active: true,
      level: { select: { name: true } },
    },
    orderBy: [
      { active: "desc" },
      { dayOfWeek: "asc" },
      { startTime: "asc" },
      { name: "asc" },
    ],
  });

  return templates.map((template) => ({
    id: template.id,
    name: template.name ?? null,
    dayOfWeek: template.dayOfWeek ?? null,
    startTime: template.startTime ?? null,
    endTime: template.endTime ?? null,
    active: template.active,
    levelName: template.level?.name ?? null,
  }));
}
