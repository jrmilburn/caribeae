"use server";

import { startOfDay } from "date-fns";
import { PayRunStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

/**
 * Audit-first notes (manual pay run lines):
 * - Only DRAFT pay runs can be mutated; locked/paid runs require retro adjustments.
 * - Dates normalized via normalizeLocalDate/startOfDay to align with timesheet entry.date.
 * - Manual lines are for non-teaching staff or ad-hoc shifts; they are stored as pay run lines with optional teacherId and staffName.
 * - rateBreakdownJson captures per-day minutes/rate for CSV exports.
 * - Uses integer math (minutes + cents) to avoid floating point issues.
 */

const schema = z.object({
  payRunId: z.string().min(1),
  teacherId: z.string().min(1).optional(),
  staffName: z.string().trim().min(1).optional(),
  date: z.union([z.date(), z.string()]),
  minutes: z.number().int().positive(),
  hourlyRateCents: z.number().int().nonnegative(),
});

export type AddManualPayRunLineInput = z.infer<typeof schema>;

export async function addManualPayRunLine(input: AddManualPayRunLineInput) {
  await getOrCreateUser();
  await requireAdmin();
  const payload = schema.parse(input);

  const date = startOfDay(normalizeLocalDate(payload.date));
  const cents = Math.round((payload.minutes * payload.hourlyRateCents) / 60);

  return prisma.$transaction(async (tx) => {
    const payRun = await tx.payRun.findUnique({ where: { id: payload.payRunId }, select: { status: true } });
    if (!payRun) throw new Error("Pay run not found.");
    if (payRun.status !== PayRunStatus.DRAFT) throw new Error("Only draft pay runs can be edited.");

    const staffLabel = payload.staffName ?? null;
    const teacherId = payload.teacherId ?? null;

    const existing = await tx.payRunLine.findFirst({
      where: { payRunId: payload.payRunId, teacherId, staffName: staffLabel },
    });

    if (existing) {
      const breakdown = Array.isArray(existing.rateBreakdownJson) ? (existing.rateBreakdownJson as Prisma.JsonArray) : [];
      breakdown.push({
        date: date.toISOString(),
        minutes: payload.minutes,
        hourlyRateCents: payload.hourlyRateCents,
        cents,
      });
      await tx.payRunLine.update({
        where: { id: existing.id },
        data: {
          minutesTotal: existing.minutesTotal + payload.minutes,
          grossCents: existing.grossCents + cents,
          rateBreakdownJson: breakdown,
          hourlyRateCentsSnapshot: null,
        },
      });
    } else {
      await tx.payRunLine.create({
        data: {
          payRunId: payload.payRunId,
          staffName: staffLabel,
          teacherId,
          minutesTotal: payload.minutes,
          grossCents: cents,
          hourlyRateCentsSnapshot: payload.hourlyRateCents,
          rateBreakdownJson: [
            {
              date: date.toISOString(),
              minutes: payload.minutes,
              hourlyRateCents: payload.hourlyRateCents,
              cents,
            },
          ],
        },
      });
    }

    const totals = await tx.payRunLine.aggregate({
      where: { payRunId: payload.payRunId },
      _sum: { grossCents: true },
    });
    await tx.payRun.update({
      where: { id: payload.payRunId },
      data: { grossCents: totals._sum.grossCents ?? 0 },
    });

    return tx.payRun.findUnique({
      where: { id: payload.payRunId },
      include: { lines: { include: { teacher: true } }, entries: true },
    });
  });
}
