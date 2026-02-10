"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import type { Prisma } from "@prisma/client";

const DAY_LOOKUP: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

export type ClassTemplateListItem = Prisma.ClassTemplateGetPayload<{
  select: {
    id: true;
    name: true;
    levelId: true;
    teacherId: true;
    startDate: true;
    endDate: true;
    dayOfWeek: true;
    startTime: true;
    endTime: true;
    capacity: true;
    active: true;
    level: {
      select: {
        id: true;
        name: true;
        defaultCapacity: true;
      };
    };
  };
}>;

export async function listClassTemplates(params: {
  q?: string | null;
  pageSize: number;
  cursor?: string | null;
  levelId?: string | null;
  teacherId?: string | null;
  status?: "active" | "inactive" | "all" | null;
}) {
  await requireAdmin();
  const trimmed = params.q?.trim().toLowerCase() ?? "";
  const dayKey = trimmed.slice(0, 3);
  const dayOfWeek = dayKey in DAY_LOOKUP ? DAY_LOOKUP[dayKey] : null;

  const searchFilters: Prisma.ClassTemplateWhereInput[] = [];

  if (trimmed) {
    searchFilters.push(
      { name: { contains: trimmed, mode: "insensitive" } },
      { level: { is: { name: { contains: trimmed, mode: "insensitive" } } } }
    );

    if (dayOfWeek !== null) {
      searchFilters.push({ dayOfWeek });
    }
  }

  const activeFilter =
    params.status === "inactive" ? false : params.status === "all" ? undefined : true;

  const where: Prisma.ClassTemplateWhereInput = {
    ...(activeFilter === undefined ? {} : { active: activeFilter }),
    ...(params.levelId ? { levelId: params.levelId } : {}),
    ...(params.teacherId ? { teacherId: params.teacherId } : {}),
    ...(searchFilters.length ? { OR: searchFilters } : {}),
  };

  const [totalCount, templates] = await prisma.$transaction([
    prisma.classTemplate.count({ where }),
    prisma.classTemplate.findMany({
      where,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }, { id: "asc" }],
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      take: params.pageSize + 1,
      select: {
        id: true,
        name: true,
        levelId: true,
        teacherId: true,
        startDate: true,
        endDate: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        capacity: true,
        active: true,
        level: {
          select: {
            id: true,
            name: true,
            defaultCapacity: true,
          },
        },
      },
    }),
  ]);

  const hasNext = templates.length > params.pageSize;
  const items = hasNext ? templates.slice(0, params.pageSize) : templates;
  const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

  return {
    items,
    totalCount,
    nextCursor,
  };
}
