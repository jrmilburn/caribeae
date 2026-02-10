"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { z } from "zod";

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

  const parsed = z
    .object({
      q: z.string().optional().nullable(),
      pageSize: z.number().int().min(1).max(200),
      cursor: z.string().optional().nullable(),
      levelId: z.string().optional().nullable(),
    })
    .parse(params);

  const filters: Prisma.FamilyWhereInput[] = [];

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
      students: {
        some: {
          levelId: parsed.levelId,
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
      cursor: parsed.cursor ? { id: parsed.cursor } : undefined,
      skip: parsed.cursor ? 1 : 0,
      take: parsed.pageSize + 1,
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

  const hasNext = families.length > parsed.pageSize;
  const items = hasNext ? families.slice(0, parsed.pageSize) : families;
  const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

  return {
    items,
    totalCount,
    nextCursor,
  };
}
