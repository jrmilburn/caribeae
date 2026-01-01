"use server";

import { endOfDay, startOfDay } from "date-fns";
import { TimesheetStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

/**
 * Audit-first notes:
 * - Mirrors teacher hours report: normalize bounds with normalizeLocalDate/startOfDay/endOfDay; minutesFinal already respects cancellations and adjustments.
 * - Exposes per-teacher summaries plus entry-level drilldowns for UI/CSV.
 * - Filters support teacherId/status/unassigned-rate flag (entries lacking a resolvable pay rate on the date).
 */

const schema = z.object({
  from: z.union([z.date(), z.string()]).optional(),
  to: z.union([z.date(), z.string()]).optional(),
  teacherId: z.string().optional(),
  status: z.nativeEnum(TimesheetStatus).optional(),
  requireRate: z.boolean().optional(),
});

export type TimesheetSummaryEntry = {
  id: string;
  date: Date;
  templateName: string | null;
  levelName: string;
  status: TimesheetStatus;
  minutesBase: number;
  minutesAdjustment: number;
  minutesFinal: number;
  teacherId: string | null;
  teacherName: string;
  substituted: boolean;
  cancelled: boolean;
  payRunId: string | null;
};

export type TimesheetTeacherSummary = {
  teacherId: string | null;
  teacherName: string;
  minutesBase: number;
  minutesAdjustment: number;
  minutesFinal: number;
  entries: TimesheetSummaryEntry[];
  statusCounts: Record<TimesheetStatus, number>;
};

export async function getTimesheetSummaries(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const parsed = schema.parse(input);
  const now = new Date();
  const from = startOfDay(parsed.from ? normalizeLocalDate(parsed.from) : now);
  const to = endOfDay(parsed.to ? normalizeLocalDate(parsed.to) : now);

  const entries = await prisma.teacherTimesheetEntry.findMany({
    where: {
      date: { gte: from, lte: to },
      teacherId: parsed.teacherId || undefined,
      status: parsed.status || undefined,
    },
    include: {
      teacher: true,
      template: { include: { level: true, teacher: true } },
    },
    orderBy: [{ date: "asc" }],
  });

  const teacherBuckets = new Map<string, TimesheetTeacherSummary>();

  entries.forEach((entry) => {
    const teacherId = entry.teacherId ?? "unassigned";
    const teacherName = entry.teacher?.name ?? "Unassigned";
    const templateTeacherId = entry.template.teacherId ?? null;
    const summary =
      teacherBuckets.get(teacherId) ??
      {
        teacherId: entry.teacherId,
        teacherName,
        minutesBase: 0,
        minutesAdjustment: 0,
        minutesFinal: 0,
        entries: [],
        statusCounts: {
          [TimesheetStatus.SCHEDULED]: 0,
          [TimesheetStatus.CONFIRMED]: 0,
          [TimesheetStatus.CANCELLED]: 0,
        },
      };

    const entryFinal = entry.status === TimesheetStatus.CANCELLED ? 0 : entry.minutesFinal;
    const detail: TimesheetSummaryEntry = {
      id: entry.id,
      date: entry.date,
      templateName: entry.template.name ?? null,
      levelName: entry.template.level.name,
      status: entry.status,
      minutesBase: entry.minutesBase,
      minutesAdjustment: entry.minutesAdjustment,
      minutesFinal: entryFinal,
      teacherId: entry.teacherId,
      teacherName,
      substituted: !!entry.teacherId && entry.teacherId !== templateTeacherId,
      cancelled: entry.status === TimesheetStatus.CANCELLED,
      payRunId: entry.payRunId,
    };

    summary.minutesBase += entry.minutesBase;
    summary.minutesAdjustment += entry.minutesAdjustment;
    summary.minutesFinal += entryFinal;
    summary.statusCounts[entry.status] += 1;
    summary.entries.push(detail);
    teacherBuckets.set(teacherId, summary);
  });

  const teachers = Array.from(teacherBuckets.values()).sort((a, b) =>
    (a.teacherName ?? "").localeCompare(b.teacherName ?? "")
  );

  return {
    filters: { from, to },
    teachers,
  };
}
