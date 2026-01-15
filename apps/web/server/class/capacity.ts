import { addDays, addWeeks, isAfter, startOfDay } from "date-fns";
import { BillingType, type EnrolmentPlan, type Prisma } from "@prisma/client";

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

const DEFAULT_WEEKLY_HORIZON_WEEKS = 8;

// Capacity enforcement scans scheduled occurrences from the effective start date through the planned
// end (or a bounded horizon for open-ended weekly plans), so later overages are still caught.
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

function resolveCapacityCheckEndDate(params: {
  plan: EnrolmentPlan;
  startDate: Date;
  windowEndDate: Date | null;
  templateEndDate: Date | null;
}) {
  let endDate = params.windowEndDate ?? null;

  if (params.plan.billingType === BillingType.PER_WEEK && !endDate) {
    const weeks =
      params.plan.durationWeeks && params.plan.durationWeeks > 0
        ? params.plan.durationWeeks
        : DEFAULT_WEEKLY_HORIZON_WEEKS;
    endDate = addWeeks(params.startDate, weeks);
  }

  if (!endDate && params.templateEndDate) {
    endDate = params.templateEndDate;
  }

  if (endDate && params.templateEndDate && isAfter(endDate, params.templateEndDate)) {
    endDate = params.templateEndDate;
  }

  return endDate ?? params.startDate;
}

function listOccurrenceDates(params: {
  template: TemplateOccurrenceInput["template"];
  startDate: Date;
  endDate: Date;
}) {
  const first = resolveOccurrenceDateOnOrAfter({
    template: params.template,
    startDate: params.startDate,
  });
  if (!first) return [] as Date[];
  const dates: Date[] = [];
  for (let cursor = first; !isAfter(cursor, params.endDate); cursor = addDays(cursor, 7)) {
    dates.push(cursor);
  }
  return dates;
}

export function listCapacityOccurrencesForTemplate(params: {
  template: TemplateOccurrenceInput["template"];
  plan: EnrolmentPlan;
  windowStart: Date;
  windowEnd: Date | null;
}) {
  const endDate = resolveCapacityCheckEndDate({
    plan: params.plan,
    startDate: params.windowStart,
    windowEndDate: params.windowEnd,
    templateEndDate: params.template.endDate,
  });
  return listOccurrenceDates({
    template: params.template,
    startDate: params.windowStart,
    endDate,
  });
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

export async function getCapacityIssueForOccurrences(params: {
  templateId: string;
  occurrenceDates: Date[];
  additionalSeats?: number;
  additionalSeatsByDate?: Map<string, number>;
  existingEnrolmentId?: string;
  client?: Prisma.TransactionClient;
}) {
  const occurrences = params.occurrenceDates
    .slice()
    .sort((a, b) => a.getTime() - b.getTime());
  for (const occurrenceDate of occurrences) {
    const key = formatDateKey(occurrenceDate);
    const additionalSeats =
      params.additionalSeatsByDate?.get(key) ?? params.additionalSeats ?? 1;
    const snapshot = await getCapacitySnapshot({
      templateId: params.templateId,
      occurrenceDate,
      additionalSeats,
      existingEnrolmentId: params.existingEnrolmentId,
      client: params.client,
    });
    if (snapshot && snapshot.projectedCount > snapshot.capacity) {
      return snapshot;
    }
  }
  return null;
}

export async function assertCapacityForTemplateRange(params: {
  template: TemplateOccurrenceInput["template"];
  plan: EnrolmentPlan;
  windowStart: Date;
  windowEnd: Date | null;
  additionalSeats?: number;
  existingEnrolmentId?: string;
  allowOverload?: boolean;
  client?: Prisma.TransactionClient;
}) {
  const occurrences = listCapacityOccurrencesForTemplate({
    template: params.template,
    plan: params.plan,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
  });
  if (!occurrences.length) return;
  const issue = await getCapacityIssueForOccurrences({
    templateId: params.template.id,
    occurrenceDates: occurrences,
    additionalSeats: params.additionalSeats ?? 1,
    existingEnrolmentId: params.existingEnrolmentId,
    client: params.client,
  });
  if (issue) {
    assertCapacityAvailable(issue, params.allowOverload);
  }
}
