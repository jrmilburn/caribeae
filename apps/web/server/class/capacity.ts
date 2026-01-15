import { addDays, isAfter, startOfDay } from "date-fns";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { formatDateKey } from "@/lib/dateKey";
import {
  buildCapacityErrorMessage,
  type CapacityExceededDetails,
} from "@/lib/capacityError";
import { getEligibleEnrolmentsForOccurrence } from "@/server/class/getClassOccurrenceRoster";

/**
 * Flow summary:
 * - Class templates store capacity; occurrences are resolved as template + date (start-of-day).
 * - Roster eligibility lives in getEligibleEnrolmentsForOccurrence (start/end windows, assignments,
 *   weekly paid-through, and level rules).
 * - UI entry points funnel into createEnrolmentsFromSelection, changeEnrolment, transitionFamily,
 *   and changeStudentLevelAndReenrol, so capacity checks are enforced there server-side.
 */

export class CapacityExceededError extends Error {
  details: CapacityExceededDetails;

  constructor(details: CapacityExceededDetails) {
    super(buildCapacityErrorMessage(details));
    this.details = details;
    this.name = "CapacityExceededError";
  }
}

type TemplateOccurrenceInput = {
  template: {
    id: string;
    name: string | null;
    dayOfWeek: number | null;
    startDate: Date;
    endDate: Date | null;
    capacity: number | null;
    levelId: string | null;
    startTime: number | null;
  };
  startDate: Date;
};

// Capacity enforcement is anchored to the first scheduled occurrence on/after the effective start date
// for each template, which avoids scanning long ranges while matching enrolment start semantics.
export function resolveOccurrenceDateOnOrAfter({ template, startDate }: TemplateOccurrenceInput) {
  if (template.dayOfWeek === null || template.dayOfWeek === undefined) return null;
  const templateStart = startOfDay(template.startDate);
  const templateEnd = template.endDate ? startOfDay(template.endDate) : null;
  const cursorStart = startOfDay(isAfter(templateStart, startDate) ? templateStart : startDate);
  if (templateEnd && isAfter(cursorStart, templateEnd)) return null;

  const targetDow = (template.dayOfWeek + 1) % 7;
  let cursor = cursorStart;
  while (cursor.getDay() !== targetDow) {
    cursor = addDays(cursor, 1);
  }
  if (templateEnd && isAfter(cursor, templateEnd)) return null;
  return cursor;
}

export function buildCapacityDetails(params: {
  templateId: string;
  templateName: string | null;
  dayOfWeek: number | null;
  startTime: number | null;
  occurrenceDate: Date;
  capacity: number;
  currentCount: number;
  additionalSeats: number;
}): CapacityExceededDetails {
  return {
    templateId: params.templateId,
    templateName: params.templateName ?? "Class",
    dayOfWeek: params.dayOfWeek ?? null,
    startTime: params.startTime ?? null,
    occurrenceDateKey: formatDateKey(params.occurrenceDate),
    capacity: params.capacity,
    currentCount: params.currentCount,
    projectedCount: params.currentCount + params.additionalSeats,
  };
}

export function assertCapacityAvailable(details: CapacityExceededDetails, allowOverload?: boolean) {
  if (details.projectedCount > details.capacity && !allowOverload) {
    throw new CapacityExceededError(details);
  }
}

export async function getCapacitySnapshot(params: {
  templateId: string;
  occurrenceDate: Date;
  additionalSeats?: number;
  existingEnrolmentId?: string;
  client?: Prisma.TransactionClient;
}): Promise<CapacityExceededDetails | null> {
  const client = params.client ?? prisma;
  const template = await client.classTemplate.findUnique({
    where: { id: params.templateId },
    select: {
      id: true,
      name: true,
      dayOfWeek: true,
      startDate: true,
      endDate: true,
      capacity: true,
      levelId: true,
      startTime: true,
    },
  });

  if (!template) {
    throw new Error("Class template not found.");
  }
  if (template.capacity === null || template.capacity === undefined) return null;
  if (!template.levelId) return null;

  const roster = await getEligibleEnrolmentsForOccurrence(
    template.id,
    template.levelId,
    params.occurrenceDate,
    { client }
  );

  const currentCount = roster.length;
  const alreadyIncluded = params.existingEnrolmentId
    ? roster.some((enrolment) => enrolment.id === params.existingEnrolmentId)
    : false;
  const additionalSeats = alreadyIncluded ? 0 : params.additionalSeats ?? 1;

  return buildCapacityDetails({
    templateId: template.id,
    templateName: template.name,
    dayOfWeek: template.dayOfWeek,
    startTime: template.startTime ?? null,
    occurrenceDate: params.occurrenceDate,
    capacity: template.capacity,
    currentCount,
    additionalSeats,
  });
}
