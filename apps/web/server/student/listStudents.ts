"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { z } from "zod";

import type { Prisma } from "@prisma/client";

export type StudentListEntry = {
  id: string;
  name: string;
  createdAt: Date;
  dateOfBirth: Date | null;
  family: {
    id: string;
    name: string | null;
  };
  level: {
    id: string;
    name: string;
  } | null;
};

export async function listStudents(params: {
  q?: string | null;
  pageSize: number;
  cursor?: string | null;
  levelId?: string | null;
}) {
  await getOrCreateUser();
  await requireAdmin();

  const parsed = z
    .object({
      q: z.string().optional().nullable(),
      pageSize: z.number().int().min(1).max(200),
      cursor: z.string().optional().nullable(),
      levelId: z.string().optional().nullable(),
    })
    .parse(params);

  const filters: Prisma.StudentWhereInput[] = [];

  if (parsed.q) {
    filters.push({
      name: {
        contains: parsed.q,
        mode: "insensitive",
      },
    });
  }

  if (parsed.levelId) {
    filters.push({
      levelId: parsed.levelId,
    });
  }

  const where: Prisma.StudentWhereInput | undefined = filters.length ? { AND: filters } : undefined;

  const [totalCount, students] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: parsed.cursor ? { id: parsed.cursor } : undefined,
      skip: parsed.cursor ? 1 : 0,
      take: parsed.pageSize + 1,
      select: {
        id: true,
        name: true,
        createdAt: true,
        dateOfBirth: true,
        family: {
          select: {
            id: true,
            name: true,
          },
        },
        level: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const hasNext = students.length > parsed.pageSize;
  const items = hasNext ? students.slice(0, parsed.pageSize) : students;
  const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

  return {
    items,
    totalCount,
    nextCursor,
  };
}
