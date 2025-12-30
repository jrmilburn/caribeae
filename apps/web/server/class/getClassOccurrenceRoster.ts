"use server";

import { EnrolmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import type { ClassOccurrenceRoster } from "@/app/admin/class/[id]/types";

export async function getClassOccurrenceRoster(templateId: string, dateKey: string): Promise<ClassOccurrenceRoster> {
  await getOrCreateUser();
  await requireAdmin();

  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error("Invalid date");
  }

  const [enrolments, attendance] = await Promise.all([
    prisma.enrolment.findMany({
      where: {
        templateId,
        status: { not: EnrolmentStatus.CANCELLED },
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      include: { student: true, plan: true },
      orderBy: [{ student: { name: "asc" } }],
    }),
    prisma.attendance.findMany({
      where: { templateId, date },
      include: { student: true },
      orderBy: [{ student: { name: "asc" } }],
    }),
  ]);

  return { enrolments, attendance };
}
