import { prisma } from "@/lib/prisma";
import type { ClassCancellation, Prisma } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";
import { formatDateKey } from "@/lib/dateKey";
import {
  expandTemplatesToOccurrences,
  normalizeDateRange,
  type TemplateOccurrence,
} from "@/server/schedule/rangeUtils";
import { computeMakeupAvailabilitiesForOccurrences, makeupSessionKey } from "@/server/makeup/availability";

export async function getTemplateOccurrences(params: {
  from: Date | string;
  to: Date | string;
  levelId?: string | null;
  makeupOnly?: boolean;
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

  const availabilityMap = await computeMakeupAvailabilitiesForOccurrences({
    occurrences: result
      .filter((occurrence) => !occurrence.cancelled)
      .map((occurrence) => ({
        templateId: occurrence.templateId,
        levelId: occurrence.levelId ?? null,
        sessionDate: occurrence.startTime,
        capacity: occurrence.capacity ?? null,
      })),
  });

  const withMakeupSpots = result.map((occurrence) => ({
    ...occurrence,
    makeupSpotsAvailable: Math.max(
      0,
      availabilityMap.get(makeupSessionKey(occurrence.templateId, occurrence.startTime))?.available ?? 0
    ),
  }));

  const filtered = params.makeupOnly
    ? withMakeupSpots.filter((occurrence) => (occurrence.makeupSpotsAvailable ?? 0) > 0)
    : withMakeupSpots;

  console.log("[schedule] occurrences generated", {
    templateCount: templates.length,
    substitutionCount: substitutions.length,
    cancellationCount: cancellations.length,
    occurrenceCount: filtered.length,
  });

  return filtered;
}
