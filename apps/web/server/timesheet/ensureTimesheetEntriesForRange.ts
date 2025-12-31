"use server";

import { addDays, isAfter, max as maxDate, min as minDate, startOfDay } from "date-fns";
import { Prisma, TimesheetSource, TimesheetStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeLocalDate } from "./normalizeLocalDate";
import { computeBaseMinutesInternal } from "./internals/computeBaseMinutesInternal";

const inputSchema = z.object({
  from: z.union([z.date(), z.string()]),
  to: z.union([z.date(), z.string()]),
  templateIds: z.array(z.string().min(1)).optional(),
});

type EnsureRangeInput = z.infer<typeof inputSchema>;

export async function ensureTimesheetEntriesForRange(input: EnsureRangeInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = inputSchema.parse(input);
  const from = normalizeLocalDate(payload.from);
  const to = normalizeLocalDate(payload.to);

  const templateWhere: Prisma.ClassTemplateWhereInput = payload.templateIds?.length
    ? { id: { in: payload.templateIds } }
    : { active: true };

  const templates = await prisma.classTemplate.findMany({
    where: templateWhere,
    include: { level: true },
  });

  const relevantTemplateIds = templates.map((t) => t.id);
  if (relevantTemplateIds.length === 0) return [];

  const [substitutions, cancellations, existingEntries] = await Promise.all([
    prisma.teacherSubstitution.findMany({
      where: {
        templateId: { in: relevantTemplateIds },
        date: { gte: from, lte: to },
      },
      select: { id: true, templateId: true, date: true, teacherId: true },
    }),
    prisma.classCancellation.findMany({
      where: {
        templateId: { in: relevantTemplateIds },
        date: { gte: from, lte: to },
      },
      select: { id: true, templateId: true, date: true },
    }),
    prisma.teacherTimesheetEntry.findMany({
      where: {
        templateId: { in: relevantTemplateIds },
        date: { gte: from, lte: to },
      },
      select: {
        id: true,
        templateId: true,
        date: true,
        status: true,
        source: true,
      },
    }),
  ]);

  const existingAdjustmentTotals = await prisma.teacherTimesheetAdjustment.groupBy({
    by: ["entryId"],
    where: { entryId: { in: existingEntries.map((e) => e.id) } },
    _sum: { minutesDelta: true },
  });

  const adjustmentMap = new Map<string, number>();
  existingAdjustmentTotals.forEach((row) => adjustmentMap.set(row.entryId, row._sum.minutesDelta ?? 0));

  const substitutionMap = new Map<string, string>();
  substitutions.forEach((sub) => substitutionMap.set(key(sub.templateId, sub.date), sub.teacherId));
  const cancellationSet = new Set<string>(cancellations.map((c) => key(c.templateId, c.date)));
  const existingEntryMap = new Map<string, (typeof existingEntries)[number]>();
  existingEntries.forEach((entry) => existingEntryMap.set(key(entry.templateId, entry.date), entry));

  const operations: Prisma.PrismaPromise<unknown>[] = [];

  for (const template of templates) {
    if (template.dayOfWeek === null || typeof template.dayOfWeek === "undefined") continue;

    const templateStart = startOfDay(template.startDate);
    const templateEnd = template.endDate ? startOfDay(template.endDate) : to;
    const spanFrom = maxDate([from, templateStart]);
    const spanTo = minDate([to, templateEnd]);
    if (isAfter(spanFrom, spanTo)) continue;

    const first = alignToTemplateDay(spanFrom, template.dayOfWeek);
    for (let cursor = first; !isAfter(cursor, spanTo); cursor = addDays(cursor, 7)) {
      const date = cursor;
      const mapKey = key(template.id, date);
      const existing = existingEntryMap.get(mapKey);
      const minutesAdjustment = existing ? adjustmentMap.get(existing.id) ?? 0 : 0;
      const baseMinutes = computeBaseMinutesInternal(template);
      const isCancelled = cancellationSet.has(mapKey);
      const status = isCancelled ? TimesheetStatus.CANCELLED : existing?.status ?? TimesheetStatus.SCHEDULED;
      const source = existing?.source ?? TimesheetSource.DERIVED;
      const minutesFinal = status === TimesheetStatus.CANCELLED ? 0 : baseMinutes + minutesAdjustment;
      const teacherId = substitutionMap.get(mapKey) ?? template.teacherId ?? null;

      operations.push(
        prisma.teacherTimesheetEntry.upsert({
          where: { templateId_date: { templateId: template.id, date } },
          create: {
            templateId: template.id,
            date,
            teacherId,
            minutesBase: baseMinutes,
            minutesAdjustment,
            minutesFinal,
            status,
            source,
          },
          update: {
            teacherId,
            minutesBase: baseMinutes,
            minutesAdjustment,
            minutesFinal,
            status,
            source,
          },
        })
      );
    }
  }

  if (operations.length === 0) return [];
  return prisma.$transaction(operations);
}

function key(templateId: string, date: Date) {
  return `${templateId}:${startOfDay(date).getTime()}`;
}

function alignToTemplateDay(start: Date, templateDayOfWeek: number) {
  const target = ((templateDayOfWeek % 7) + 7) % 7;
  let cursor = startOfDay(start);
  while (cursor.getDay() !== ((target + 1) % 7)) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}
