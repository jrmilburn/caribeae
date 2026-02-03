"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export type ReceptionSearchResults = {
  families: Array<{
    id: string;
    name: string;
    primaryContactName: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
  }>;
  students: Array<{
    id: string;
    name: string;
    familyId: string;
    familyName: string;
    levelName: string | null;
  }>;
};

export async function searchReception(query: string): Promise<ReceptionSearchResults> {
  await getOrCreateUser();
  await requireAdmin();

  const term = query.trim();
  if (!term) {
    return { families: [], students: [] };
  }

  const [families, students] = await Promise.all([
    prisma.family.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { primaryContactName: { contains: term, mode: "insensitive" } },
          { primaryEmail: { contains: term, mode: "insensitive" } },
          { primaryPhone: { contains: term, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        primaryContactName: true,
        primaryEmail: true,
        primaryPhone: true,
      },
      orderBy: { name: "asc" },
      take: 8,
    }),
    prisma.student.findMany({
      where: {
        name: { contains: term, mode: "insensitive" },
      },
      select: {
        id: true,
        name: true,
        family: { select: { id: true, name: true } },
        level: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      take: 8,
    }),
  ]);

  return {
    families,
    students: students.map((student) => ({
      id: student.id,
      name: student.name,
      familyId: student.family.id,
      familyName: student.family.name,
      levelName: student.level?.name ?? null,
    })),
  };
}
