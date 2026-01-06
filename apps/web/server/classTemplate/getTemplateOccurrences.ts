import { prisma } from "@/lib/prisma";
import type { ClassCancellation, Prisma } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";
import { formatDateKey } from "@/lib/dateKey";
import {
  expandTemplatesToOccurrences,
  normalizeDateRange,
  type TemplateOccurrence,
} from "@/server/schedule/rangeUtils";

export async function getTemplateOccurrences(params: {
  from: Date | string;
  to: Date | string;
  levelId?: string | null;
}): Promise<TemplateOccurrence[]> {
  const range = normalizeDateRange(params);

  console.log("[schedule] getTemplateOccurrences", {
    fromParam: params.from,
    toParam: params.to,
    normalizedFrom: range.from.toISOString(),
    normalizedTo: range.to.toISOString(),
    levelId: params.levelId ?? null,
  });

  const templates = await prisma.classTemplate.findMany({
    where: {
      active: true,
      startDate: { lte: range.to },
      OR: [{ endDate: null }, { endDate: { gte: range.from } }],
      ...(params.levelId ? { levelId: params.levelId } : {}),
    },
    include: { level: true, teacher: true },
  });

  const occurrences = expandTemplatesToOccurrences(templates, range);

  if (!occurrences.length) {
    console.log("[schedule] no occurrences generated", { templateCount: templates.length });
    return occurrences;
  }

  const substitutions = await prisma.teacherSubstitution.findMany({
    where: {
      templateId: { in: templates.map((t) => t.id) },
      date: { gte: startOfDay(range.from), lte: endOfDay(range.to) },
    },
    include: { teacher: true },
  });

  const cancellations = await prisma.classCancellation.findMany({
    where: {
      templateId: { in: templates.map((t) => t.id) },
      date: { gte: startOfDay(range.from), lte: endOfDay(range.to) },
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

  const result = occurrences.map((occ) => {
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

  console.log("[schedule] occurrences generated", {
    templateCount: templates.length,
    substitutionCount: substitutions.length,
    cancellationCount: cancellations.length,
    occurrenceCount: result.length,
  });

  return result;
}
