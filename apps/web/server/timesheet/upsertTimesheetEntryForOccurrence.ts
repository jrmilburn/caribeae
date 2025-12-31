"use server";

import { addDays, startOfDay } from "date-fns";
import { Prisma, TimesheetSource, TimesheetStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeLocalDate } from "./normalizeLocalDate";
import { computeBaseMinutesInternal } from "./internals/computeBaseMinutesInternal";

/**
 * Audit-first plan (kept as code comments for future reviewers):
 * - Date normalization: Attendance, substitutions, and cancellations all use parseDateKey (startOfDay on ISO strings). We reuse the same startOfDay normalization via normalizeLocalDate to ensure TeacherTimesheetEntry.date aligns with those records.
 * - Effective teacher: getClassPageData already resolves substitutions via teacherSubstitution on (templateId, date); we mirror that logic by preferring substitutions over template.teacherId and allowing null ("Unassigned") when neither is set.
 * - Base minutes: class templates store startTime/endTime as minutes since midnight; if invalid or missing we fall back to level.defaultLengthMin, matching roster/occurrence logic.
 * - Cancellation handling: ClassCancellation upserts per (templateId, date). When cancelled we keep scheduled minutesBase (for audit) but set minutesFinal to 0 and status CANCELLED.
 * - Adjustments: TeacherTimesheetAdjustment rows must sum to TeacherTimesheetEntry.minutesAdjustment. Upserts preserve adjustments by recomputing the sum before writing minutesAdjustment/minutesFinal.
 * - Status/source conventions: Derived range generation => SCHEDULED/DERIVED; attendance => CONFIRMED/ATTENDANCE; cancellation forces CANCELLED; manual actions can opt into MANUAL source via options.
 */

const inputSchema = z.object({
  templateId: z.string().min(1),
  date: z.union([z.date(), z.string()]),
  status: z.nativeEnum(TimesheetStatus).optional(),
  source: z.nativeEnum(TimesheetSource).optional(),
});

type UpsertInput = z.infer<typeof inputSchema>;

type UpsertResult = Prisma.TeacherTimesheetEntryGetPayload<{
  include: { template: { include: { level: true } }; teacher: true; adjustments: true };
}>;

export async function upsertTimesheetEntryForOccurrence(input: UpsertInput): Promise<UpsertResult> {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = inputSchema.parse(input);
  const date = normalizeLocalDate(payload.date);

  return prisma.$transaction(async (tx) => {
    const template = await tx.classTemplate.findUnique({
      where: { id: payload.templateId },
      include: { level: true },
    });
    if (!template) {
      throw new Error("Class template not found");
    }

    const [substitution, cancellation, existingEntry] = await Promise.all([
      tx.teacherSubstitution.findUnique({
        where: { templateId_date: { templateId: payload.templateId, date } },
        select: { teacherId: true },
      }),
      tx.classCancellation.findUnique({
        where: { templateId_date: { templateId: payload.templateId, date } },
        select: { id: true },
      }),
      tx.teacherTimesheetEntry.findUnique({
        where: { templateId_date: { templateId: payload.templateId, date } },
        select: { id: true, minutesAdjustment: true, status: true, source: true },
      }),
    ]);

    const baseMinutes = computeBaseMinutesInternal(template);
    const effectiveTeacherId = substitution?.teacherId ?? template.teacherId ?? null;
    const existingAdjustmentSum = existingEntry
      ? await tx.teacherTimesheetAdjustment.aggregate({
          where: { entryId: existingEntry.id },
          _sum: { minutesDelta: true },
        })
      : { _sum: { minutesDelta: 0 } };
    const minutesAdjustment = existingAdjustmentSum._sum.minutesDelta ?? 0;

    const status = cancellation
      ? TimesheetStatus.CANCELLED
      : payload.status ?? existingEntry?.status ?? TimesheetStatus.SCHEDULED;
    const source = payload.source ?? existingEntry?.source ?? TimesheetSource.DERIVED;
    const minutesFinal = status === TimesheetStatus.CANCELLED ? 0 : baseMinutes + minutesAdjustment;

    const entry = await tx.teacherTimesheetEntry.upsert({
      where: { templateId_date: { templateId: payload.templateId, date } },
      create: {
        templateId: payload.templateId,
        date,
        teacherId: effectiveTeacherId,
        minutesBase: baseMinutes,
        minutesAdjustment,
        minutesFinal,
        status,
        source,
        createdById: user.id,
      },
      update: {
        teacherId: effectiveTeacherId,
        minutesBase: baseMinutes,
        minutesAdjustment,
        minutesFinal,
        status,
        source,
      },
      include: { template: { include: { level: true } }, teacher: true, adjustments: true },
    });

    return entry;
  });
}

export function expandRangeDates(from: Date, to: Date): Date[] {
  const start = startOfDay(from);
  const end = startOfDay(to);
  const days: Date[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}
