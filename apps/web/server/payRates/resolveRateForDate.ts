"use server";

import { startOfDay } from "date-fns";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

/**
 * Audit-first notes:
 * - Reuses normalizeLocalDate/startOfDay to align with timesheet entry.date (local midnight).
 * - Rate selection picks latest effectiveFrom <= date with effectiveTo null or >= date.
 * - Returns null when no rate is configured; callers handle validation/guard rails.
 */

const schema = z.object({
  teacherId: z.string().min(1),
  onDate: z.union([z.date(), z.string()]),
});

export async function resolveRateForDate(input: z.infer<typeof schema>) {
  const payload = schema.parse(input);
  const date = startOfDay(normalizeLocalDate(payload.onDate));

  return prisma.teacherPayRate.findFirst({
    where: {
      teacherId: payload.teacherId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}
