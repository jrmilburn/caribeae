"use server";

import { startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

/**
 * Audit-first notes (pay rate layer):
 * - Existing timesheet flows normalize all occurrence dates via normalizeLocalDate (startOfDay on ISO) and store minutes as integers; we reuse that for effectiveFrom/effectiveTo.
 * - TeacherHours and adjustment logic rely on TeacherTimesheetEntry.minutesFinal already reflecting cancellations/substitutions; payroll must not mutate those rows unless unlinking from a draft pay run.
 * - Currency helpers live in lib/currency (integer cents); we therefore store hourlyRateCents as an integer and avoid floating math.
 * - Auth patterns: server actions guard via getOrCreateUser + requireAdmin; keep consistent.
 * - Overlap prevention: each teacher must have non-overlapping effective ranges; we enforce this in a transaction with exclusion of the current rate when editing.
 */

const payloadSchema = z.object({
  id: z.string().optional(),
  teacherId: z.string().min(1),
  hourlyRateCents: z.number().int().nonnegative(),
  effectiveFrom: z.union([z.date(), z.string()]),
  effectiveTo: z.union([z.date(), z.string()]).nullable().optional(),
});

export type SaveTeacherPayRateInput = z.infer<typeof payloadSchema>;

export async function saveTeacherPayRate(input: SaveTeacherPayRateInput) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const parsed = payloadSchema.parse(input);
  const effectiveFrom = startOfDay(normalizeLocalDate(parsed.effectiveFrom));
  const effectiveTo = parsed.effectiveTo ? startOfDay(normalizeLocalDate(parsed.effectiveTo)) : null;
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error("Effective to date must be after effective from date.");
  }

  return prisma.$transaction(async (tx) => {
    // Prevent overlap with any existing rate windows for this teacher.
    const overlapping = await tx.teacherPayRate.findFirst({
      where: {
        teacherId: parsed.teacherId,
        id: parsed.id ? { not: parsed.id } : undefined,
        AND: [
          { effectiveFrom: { lte: effectiveTo ?? effectiveFrom } },
          {
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: effectiveFrom } },
            ],
          },
        ],
      },
    });
    if (overlapping) {
      throw new Error("Rate overlaps an existing effective period.");
    }

    const data: Prisma.TeacherPayRateUncheckedCreateInput = {
      teacherId: parsed.teacherId,
      hourlyRateCents: parsed.hourlyRateCents,
      effectiveFrom,
      effectiveTo,
      createdById: user.id,
    };

    if (parsed.id) {
      const updated = await tx.teacherPayRate.update({
        where: { id: parsed.id },
        data: {
          ...data,
          createdById: undefined, // do not overwrite creator
        },
      });
      return updated;
    }

    return tx.teacherPayRate.create({ data });
  });
}
