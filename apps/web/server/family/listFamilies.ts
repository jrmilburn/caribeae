"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

import type { Family, Prisma } from "@prisma/client";

export type FamilyListEntry = Pick<
  Family,
  | "id"
  | "name"
  | "primaryContactName"
  | "primaryEmail"
  | "primaryPhone"
  | "secondaryContactName"
  | "secondaryEmail"
  | "secondaryPhone"
  | "medicalContactName"
  | "medicalContactPhone"
  | "address"
>;

export async function listFamilies(params: {
  q?: string | null;
  pageSize: number;
  cursor?: string | null;
  levelId?: string | null;
}) {
  await getOrCreateUser();
  await requireAdmin();

  const filters: Prisma.FamilyWhereInput[] = [];

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
      students: {
        some: {
          levelId: params.levelId,
        },
      },
    });
  }

  const where: Prisma.FamilyWhereInput | undefined = filters.length ? { AND: filters } : undefined;

  const [totalCount, families] = await prisma.$transaction([
    prisma.family.count({ where }),
    prisma.family.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      take: params.pageSize + 1,
      select: {
        id: true,
        name: true,
        primaryContactName: true,
        primaryEmail: true,
        primaryPhone: true,
        secondaryContactName: true,
        secondaryEmail: true,
        secondaryPhone: true,
        medicalContactName: true,
        medicalContactPhone: true,
        address: true,
      },
    }),
  ]);

  const hasNext = families.length > params.pageSize;
  const items = hasNext ? families.slice(0, params.pageSize) : families;
  const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

  return {
    items,
    totalCount,
    nextCursor,
  };
}
