"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";

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

  const filters: Prisma.StudentWhereInput[] = [];

  if (params.q) {
    filters.push({
      name: {
        contains: params.q,
        mode: "insensitive",
      },
    });
  }

  if (params.levelId) {
    filters.push({
      levelId: params.levelId,
    });
  }

  const where: Prisma.StudentWhereInput | undefined = filters.length ? { AND: filters } : undefined;

  const [totalCount, students] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      take: params.pageSize + 1,
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

  const hasNext = students.length > params.pageSize;
  const items = hasNext ? students.slice(0, params.pageSize) : students;
  const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

  return {
    items,
    totalCount,
    nextCursor,
  };
}
