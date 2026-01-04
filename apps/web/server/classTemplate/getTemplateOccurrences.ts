import { prisma } from "@/lib/prisma";
import { addDays, addMinutes, endOfDay, format, getISODay, startOfDay } from "date-fns";
import type { Prisma, ClassCancellation } from "@prisma/client";
import { formatDateKey } from "@/lib/dateKey";

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
  cancelled?: boolean;
  cancellationReason?: string | null;
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

  const occurrences = templates.flatMap((template) => expandTemplateToRange(template, from, to));

  if (!occurrences.length) return occurrences;

  const substitutions = await prisma.teacherSubstitution.findMany({
    where: {
      templateId: { in: templates.map((t) => t.id) },
      date: { gte: startOfDay(from), lte: endOfDay(to) },
    },
    include: { teacher: true },
  });

  const cancellations = await prisma.classCancellation.findMany({
    where: {
      templateId: { in: templates.map((t) => t.id) },
      date: { gte: startOfDay(from), lte: endOfDay(to) },
    },
  });

  const substitutionMap = new Map<string, Prisma.TeacherSubstitutionGetPayload<{ include: { teacher: true } }>>();
  substitutions.forEach((sub) => {
    substitutionMap.set(`${sub.templateId}-${formatDateKey(sub.date)}`, sub);
  });

  const cancellationMap = new Map<string, ClassCancellation>();
  cancellations.forEach((cancellation) => {
    cancellationMap.set(`${cancellation.templateId}-${formatDateKey(cancellation.date)}`, cancellation);
  });

  return occurrences.map((occ) => {
    const sub = substitutionMap.get(`${occ.templateId}-${formatDateKey(occ.startTime)}`);
    const cancellation = cancellationMap.get(`${occ.templateId}-${formatDateKey(occ.startTime)}`);
    const withSubstitution = sub
      ? {
          ...occ,
          teacher: sub.teacher,
          teacherId: sub.teacherId,
        }
      : occ;

    return {
      ...withSubstitution,
      cancelled: Boolean(cancellation),
      cancellationReason: cancellation?.reason ?? null,
    };
  });
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
