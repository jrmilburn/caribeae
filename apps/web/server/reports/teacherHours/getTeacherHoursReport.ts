"use server";

import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { TimesheetSource, TimesheetStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

/**
 * Audit-first plan:
 * - Date normalization mirrors attendance/substitution/cancellation (startOfDay on ISO) so report bounds use normalizeLocalDate and endOfDay for inclusive ranges.
 * - Substitutions are reflected by comparing entry.teacherId to template.teacherId; cancellations rely on status=CANCELLED and minutesFinal=0.
 * - Adjustments rely on TeacherTimesheetAdjustment rows; entry.minutesAdjustment is expected to match their sum from server actions.
 * - Base minutes come from entries (already derived from template schedule/default level length).
 */

const inputSchema = z.object({
  from: z.union([z.date(), z.string()]).optional(),
  to: z.union([z.date(), z.string()]).optional(),
});

export type TeacherHoursEntry = {
  id: string;
  templateId: string;
  templateName: string | null;
  levelName: string;
  date: Date;
  startTime: number | null;
  endTime: number | null;
  status: TimesheetStatus;
  source: TimesheetSource;
  teacherId: string | null;
  teacherName: string;
  minutesBase: number;
  minutesAdjustment: number;
  minutesFinal: number;
  substituted: boolean;
  cancelled: boolean;
  adjustments: {
    id: string;
    minutesDelta: number;
    reason: string | null;
    createdAt: Date;
  }[];
};

export type TeacherHoursSummaryRow = {
  teacherId: string | null;
  teacherName: string;
  totalClasses: number;
  baseMinutes: number;
  adjustmentMinutes: number;
  finalMinutes: number;
  entries: TeacherHoursEntry[];
};

export type TeacherHoursReport = {
  filters: { from: Date; to: Date };
  summary: {
    totalMinutes: number;
    totalClasses: number;
    totalAdjustmentMinutes: number;
  };
  teachers: TeacherHoursSummaryRow[];
  adjustments: {
    id: string;
    entryId: string;
    teacherName: string;
    minutesDelta: number;
    reason: string | null;
    createdAt: Date;
  }[];
};

export async function getTeacherHoursReport(input: z.infer<typeof inputSchema>): Promise<TeacherHoursReport> {
  await getOrCreateUser();
  await requireAdmin();

  const payload = inputSchema.parse(input);
  const now = new Date();
  const defaultFrom = startOfMonth(now);
  const defaultTo = endOfMonth(now);
  const from = startOfDay(payload.from ? normalizeLocalDate(payload.from) : defaultFrom);
  const to = endOfDay(payload.to ? normalizeLocalDate(payload.to) : defaultTo);

  const entries = await prisma.teacherTimesheetEntry.findMany({
    where: { date: { gte: from, lte: to } },
    include: {
      teacher: true,
      template: { include: { level: true, teacher: true } },
      adjustments: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ date: "asc" }],
  });

  const teacherBuckets = new Map<string, TeacherHoursSummaryRow>();
  const adjustments: TeacherHoursReport["adjustments"] = [];
  let totalMinutes = 0;
  let totalClasses = 0;
  let totalAdjustmentMinutes = 0;

  entries.forEach((entry) => {
    const teacherId = entry.teacherId ?? "unassigned";
    const teacherName = entry.teacher?.name ?? "Unassigned";
    const templateTeacherId = entry.template.teacherId ?? null;

    const detail: TeacherHoursEntry = {
      id: entry.id,
      templateId: entry.templateId,
      templateName: entry.template.name ?? null,
      levelName: entry.template.level.name,
      date: entry.date,
      startTime: entry.template.startTime ?? null,
      endTime: entry.template.endTime ?? null,
      status: entry.status,
      source: entry.source,
      teacherId: entry.teacherId,
      teacherName,
      minutesBase: entry.minutesBase,
      minutesAdjustment: entry.minutesAdjustment,
      minutesFinal: entry.minutesFinal,
      substituted: !!entry.teacherId && entry.teacherId !== templateTeacherId,
      cancelled: entry.status === TimesheetStatus.CANCELLED,
      adjustments: entry.adjustments.map((adj) => ({
        id: adj.id,
        minutesDelta: adj.minutesDelta,
        reason: adj.reason,
        createdAt: adj.createdAt,
      })),
    };

    const bucket =
      teacherBuckets.get(teacherId) ??
      {
        teacherId: entry.teacherId,
        teacherName,
        totalClasses: 0,
        baseMinutes: 0,
        adjustmentMinutes: 0,
        finalMinutes: 0,
        entries: [],
      };

    bucket.totalClasses += 1;
    bucket.baseMinutes += entry.minutesBase;
    bucket.adjustmentMinutes += entry.minutesAdjustment;
    bucket.finalMinutes += entry.minutesFinal;
    bucket.entries.push(detail);
    teacherBuckets.set(teacherId, bucket);

    totalMinutes += entry.minutesFinal;
    totalClasses += 1;
    totalAdjustmentMinutes += entry.minutesAdjustment;

    entry.adjustments.forEach((adj) =>
      adjustments.push({
        id: adj.id,
        entryId: entry.id,
        teacherName,
        minutesDelta: adj.minutesDelta,
        reason: adj.reason,
        createdAt: adj.createdAt,
      })
    );
  });

  const teachers = Array.from(teacherBuckets.values()).sort((a, b) => {
    if (a.teacherName === b.teacherName) return 0;
    return a.teacherName.localeCompare(b.teacherName);
  });

  return {
    filters: { from, to },
    summary: {
      totalMinutes,
      totalClasses,
      totalAdjustmentMinutes,
    },
    teachers,
    adjustments: adjustments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
  };
}
