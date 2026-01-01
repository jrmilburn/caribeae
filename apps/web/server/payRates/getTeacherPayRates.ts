"use server";

import { startOfDay } from "date-fns";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

/**
 * Audit-first notes:
 * - Timesheet/reporting dates are normalized to startOfDay via normalizeLocalDate; we keep the same convention when filtering for a range.
 * - Minimal selects for list views; ordering by effectiveFrom ascending to read ranges.
 */

const inputSchema = z.object({
  teacherId: z.string().min(1),
  onDate: z.union([z.date(), z.string()]).optional(),
});

export async function getTeacherPayRates(input: z.infer<typeof inputSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = inputSchema.parse(input);
  const onDate = payload.onDate ? startOfDay(normalizeLocalDate(payload.onDate)) : null;

  return prisma.teacherPayRate.findMany({
    where: {
      teacherId: payload.teacherId,
      ...(onDate
        ? {
            effectiveFrom: { lte: onDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: onDate } }],
          }
        : {}),
    },
    orderBy: { effectiveFrom: "asc" },
  });
}
