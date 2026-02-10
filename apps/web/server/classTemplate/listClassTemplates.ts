"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

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
  const parsed = z
    .object({
      q: z.string().optional().nullable(),
      pageSize: z.number().int().min(1).max(200),
      cursor: z.string().optional().nullable(),
      levelId: z.string().optional().nullable(),
      teacherId: z.string().optional().nullable(),
      status: z.enum(["active", "inactive", "all"]).optional().nullable(),
    })
    .parse(params);

  const trimmed = parsed.q?.trim().toLowerCase() ?? "";
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
    parsed.status === "inactive" ? false : parsed.status === "all" ? undefined : true;

  const where: Prisma.ClassTemplateWhereInput = {
    ...(activeFilter === undefined ? {} : { active: activeFilter }),
    ...(parsed.levelId ? { levelId: parsed.levelId } : {}),
    ...(parsed.teacherId ? { teacherId: parsed.teacherId } : {}),
    ...(searchFilters.length ? { OR: searchFilters } : {}),
  };

  const [totalCount, templates] = await prisma.$transaction([
    prisma.classTemplate.count({ where }),
    prisma.classTemplate.findMany({
      where,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }, { id: "asc" }],
      cursor: parsed.cursor ? { id: parsed.cursor } : undefined,
      skip: parsed.cursor ? 1 : 0,
      take: parsed.pageSize + 1,
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

  const hasNext = templates.length > parsed.pageSize;
  const items = hasNext ? templates.slice(0, parsed.pageSize) : templates;
  const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

  return {
    items,
    totalCount,
    nextCursor,
  };
}
