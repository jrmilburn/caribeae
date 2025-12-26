import { prisma } from "@/lib/prisma";
import { addDays, addMinutes, endOfDay, format, getISODay, startOfDay } from "date-fns";
import type { Prisma } from "@prisma/client";

export type TemplateOccurrence = {
  id: string;
  templateId: string;
  templateName?: string | null;
  startTime: Date;
  endTime: Date;
  capacity?: number | null;
  level?: Prisma.ClassTemplateGetPayload<{ include: { level: true; teacher: true } }>['level'];
  levelId?: string;
  teacher?: Prisma.ClassTemplateGetPayload<{ include: { level: true; teacher: true } }>['teacher'];
  teacherId?: string | null;
  template?: Prisma.ClassTemplateGetPayload<{ include: { level: true; teacher: true } }>;
};

export async function getTemplateOccurrences(params: { from: Date; to: Date }): Promise<TemplateOccurrence[]> {
  const { from, to } = params;

  const templates = await prisma.classTemplate.findMany({
    where: {
      active: true,
      startDate: { lte: to },
      OR: [{ endDate: null }, { endDate: { gte: from } }],
    },
    include: { level: true, teacher: true },
  });

  return templates.flatMap((template) => expandTemplateToRange(template, from, to));
}

function expandTemplateToRange(
  template: Prisma.ClassTemplateGetPayload<{ include: { level: true; teacher: true } }>,
  from: Date,
  to: Date
): TemplateOccurrence[] {
  if (template.dayOfWeek === null || template.dayOfWeek === undefined) return [];
  if (template.startTime === null || template.startTime === undefined) return [];

  const rangeStart = startOfDay(from);
  const rangeEnd = endOfDay(to);
  const templateStart = startOfDay(template.startDate);
  const templateEnd = template.endDate ? endOfDay(template.endDate) : null;

  if (templateEnd && templateEnd < rangeStart) return [];
  if (templateStart > rangeEnd) return [];

  const targetIsoDay = template.dayOfWeek === 6 ? 7 : template.dayOfWeek + 1; // Prisma comment: 0=Mon..6=Sun
  let cursor = startOfDay(rangeStart);
  const rangeIso = getISODay(cursor);
  const daysUntilTarget = (targetIsoDay - rangeIso + 7) % 7;
  cursor = addDays(cursor, daysUntilTarget);

  while (cursor < templateStart) {
    cursor = addDays(cursor, 7);
  }

  const durationMin = resolveDuration(template);
  if (durationMin <= 0) return [];

  const occurrences: TemplateOccurrence[] = [];

  while (cursor <= rangeEnd) {
    if (templateEnd && cursor > templateEnd) break;

    const startTime = addMinutes(cursor, template.startTime ?? 0);
    const endTime = addMinutes(startTime, durationMin);

    occurrences.push({
      id: `${template.id}-${format(cursor, "yyyy-MM-dd")}`,
      templateId: template.id,
      templateName: template.name,
      startTime,
      endTime,
      capacity: template.capacity ?? template.level?.defaultCapacity ?? null,
      level: template.level,
      levelId: template.levelId,
      teacher: template.teacher,
      teacherId: template.teacherId,
      template,
    });

    cursor = addDays(cursor, 7);
  }

  return occurrences;
}

function resolveDuration(template: Prisma.ClassTemplateGetPayload<{ include: { level: true } }>): number {
  const start = template.startTime;
  const end = template.endTime;
  if (typeof start === "number" && typeof end === "number" && end > start) {
    return end - start;
  }

  const levelDefault = template.level?.defaultLengthMin;
  if (typeof levelDefault === "number" && levelDefault > 0) return levelDefault;

  return 45; // reasonable fallback
}
