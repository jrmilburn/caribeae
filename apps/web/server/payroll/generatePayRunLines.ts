"use server";

import { PayRunStatus, Prisma, TimesheetStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Audit-first notes:
 * - Timesheet entries already encapsulate substitutions/cancellations and minutesAdjustment in minutesFinal; we treat minutesFinal as the source of truth and zero-out CANCELLED entries defensively.
 * - Rate resolution uses effective-dated TeacherPayRate: pick the latest effectiveFrom <= entry.date where effectiveTo is null or >= date.
 * - Guard rails: only DRAFT runs may be regenerated; we unlink and rebuild links/lines inside a transaction.
 * - Retro adjustments are tracked separately via PayrollAdjustment and are included in preview totals but only marked applied during locking.
 * - Integer math only (cents and minutes); no floating point.
 */

const schema = z.object({
  payRunId: z.string().min(1),
});

type RateWindow = {
  teacherId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  hourlyRateCents: number;
};

type RateBreakdown = {
  entryId: string;
  date: string;
  minutes: number;
  hourlyRateCents: number;
  cents: number;
};

export async function generatePayRunLines(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();
  const payload = schema.parse(input);

  return prisma.$transaction(async (tx) => {
    const payRun = await tx.payRun.findUnique({ where: { id: payload.payRunId } });
    if (!payRun) throw new Error("Pay run not found.");
    if (payRun.status !== PayRunStatus.DRAFT) {
      throw new Error("Only draft pay runs can be regenerated.");
    }

    const [entries, rateWindows, retroAdjustments, manualLines] = await Promise.all([
      tx.teacherTimesheetEntry.findMany({
        where: {
          date: { gte: payRun.periodStart, lte: payRun.periodEnd },
          OR: [{ payRunId: null }, { payRunId: payRun.id }],
        },
        include: {
          teacher: true,
        },
      }),
      tx.teacherPayRate.findMany({
        where: { effectiveFrom: { lte: payRun.periodEnd } },
      }),
      tx.payrollAdjustment.findMany({
        where: {
          appliedPayRunId: null,
          date: { gte: payRun.periodStart, lte: payRun.periodEnd },
        },
      }),
      tx.payRunLine.findMany({
        where: { payRunId: payRun.id, teacherId: null },
      }),
    ]);

    const teacherIds = new Set(entries.map((e) => e.teacherId).filter(Boolean) as string[]);
    const ratesByTeacher = new Map<string, RateWindow[]>();
    rateWindows.forEach((rate) => {
      if (!teacherIds.has(rate.teacherId)) return;
      const list = ratesByTeacher.get(rate.teacherId) ?? [];
      list.push({
        teacherId: rate.teacherId,
        effectiveFrom: rate.effectiveFrom,
        effectiveTo: rate.effectiveTo,
        hourlyRateCents: rate.hourlyRateCents,
      });
      ratesByTeacher.set(rate.teacherId, list);
    });
    ratesByTeacher.forEach((list) => list.sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()));

    const lines = new Map<
      string,
      {
        teacherId: string;
        staffName?: string | null;
        minutesTotal: number;
        grossCents: number;
        breakdown: RateBreakdown[];
      }
    >();

    const missingRates: string[] = [];

    entries.forEach((entry) => {
      if (!entry.teacherId) return;
      const minutesFinal = entry.status === TimesheetStatus.CANCELLED ? 0 : entry.minutesFinal;
      if (minutesFinal <= 0) {
        return;
      }
      const rates = ratesByTeacher.get(entry.teacherId) ?? [];
      const rate = rates.find(
        (r) =>
          r.effectiveFrom.getTime() <= entry.date.getTime() &&
          (!r.effectiveTo || r.effectiveTo.getTime() >= entry.date.getTime())
      );
      if (!rate) {
        missingRates.push(entry.teacher?.name ?? entry.teacherId);
        return;
      }
      const cents = Math.round((minutesFinal * rate.hourlyRateCents) / 60);
      const existing =
        lines.get(entry.teacherId) ?? {
          teacherId: entry.teacherId,
          minutesTotal: 0,
          grossCents: 0,
          breakdown: [],
        };
      existing.minutesTotal += minutesFinal;
      existing.grossCents += cents;
      existing.breakdown.push({
        entryId: entry.id,
        date: entry.date.toISOString(),
        minutes: minutesFinal,
        hourlyRateCents: rate.hourlyRateCents,
        cents,
      });
      lines.set(entry.teacherId, existing);
    });

    retroAdjustments.forEach((adj) => {
      const existing =
        lines.get(adj.teacherId) ??
        {
          teacherId: adj.teacherId,
          minutesTotal: 0,
          grossCents: 0,
          breakdown: [],
        };
      existing.minutesTotal += adj.minutesDelta;
      existing.grossCents += adj.centsDelta;
      lines.set(adj.teacherId, existing);
    });

    if (missingRates.length > 0) {
      throw new Error(`Missing pay rates for: ${Array.from(new Set(missingRates)).join(", ")}`);
    }

    // Clean slate before re-linking: keep manual lines (teacherId null) intact.
    await tx.teacherTimesheetEntry.updateMany({
      where: { payRunId: payRun.id },
      data: { payRunId: null },
    });
    await tx.payRunLine.deleteMany({ where: { payRunId: payRun.id, teacherId: { not: null } } });

    const eligibleEntryIds = entries
      .filter((e) => e.teacherId && e.status !== TimesheetStatus.CANCELLED)
      .map((e) => e.id);

    if (eligibleEntryIds.length > 0) {
      await tx.teacherTimesheetEntry.updateMany({
        where: { id: { in: eligibleEntryIds } },
        data: { payRunId: payRun.id },
      });
    }

    let grossTotal = manualLines.reduce((acc, line) => acc + line.grossCents, 0);
    if (lines.size > 0) {
      const createData: Prisma.PayRunLineCreateManyInput[] = [];
      lines.forEach((line) => {
        grossTotal += line.grossCents;
        createData.push({
          payRunId: payRun.id,
          teacherId: line.teacherId,
          minutesTotal: line.minutesTotal,
          grossCents: line.grossCents,
          hourlyRateCentsSnapshot:
            line.breakdown.length === 1 ? line.breakdown[0]?.hourlyRateCents ?? null : null,
          rateBreakdownJson: line.breakdown.length > 1 ? line.breakdown : Prisma.DbNull,
        });
      });
      await tx.payRunLine.createMany({ data: createData });
    }

    const updated = await tx.payRun.update({
      where: { id: payRun.id },
      data: { grossCents: grossTotal },
      include: {
        lines: {
          include: { teacher: true },
          orderBy: { teacher: { name: "asc" } },
        },
      },
    });

    return updated;
  });
}
