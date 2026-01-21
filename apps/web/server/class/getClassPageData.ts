"use server";

import { addDays, isAfter, isBefore } from "date-fns";
import { EnrolmentAdjustmentType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import { brisbaneDayOfWeek, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import type { ClassPageData, ClientTemplateWithInclusions } from "@/app/admin/class/[id]/types";
import { getClassOccurrenceRoster } from "./getClassOccurrenceRoster";

export async function getClassPageData(templateId: string, requestedDateKey: string | undefined): Promise<ClassPageData | null> {
  await getOrCreateUser();
  await requireAdmin();

  const template = await prisma.classTemplate.findUnique({
    where: { id: templateId },
    include: {
      level: true,
      teacher: true,
      enrolments: {
        include: {
          student: true,
          plan: true,
          classAssignments: { include: { template: true } },
        },
      },
    },
  });

  if (!template) return null;

  const requestedDate = parseDateKey(requestedDateKey ?? null);
  const requestedDateValid = isValidOccurrenceDate(template, requestedDate);

  const availableDateKeys = buildRecentOccurrenceDateKeys(template, requestedDateValid ? requestedDate : null);
  const selectedDateKey = requestedDateValid
    ? toBrisbaneDayKey(requestedDate as Date)
    : availableDateKeys[availableDateKeys.length - 1] ?? null;

  const selectedDate = parseDateKey(selectedDateKey);

  const [teachers, levels, students, enrolmentPlans, substitution, cancellation, cancellationCredits] =
    await Promise.all([
      prisma.teacher.findMany({ orderBy: { name: "asc" } }),
      prisma.level.findMany({ orderBy: { levelOrder: "asc" } }),
      prisma.student.findMany({
        where: { levelId: template.levelId },
        orderBy: { name: "asc" },
      }),
      prisma.enrolmentPlan.findMany({ where: { levelId: template.levelId } }),
      selectedDate
        ? prisma.teacherSubstitution.findUnique({
            where: { templateId_date: { templateId, date: selectedDate } },
            include: { teacher: true },
          })
        : null,
      selectedDate
        ? prisma.classCancellation.findUnique({
            where: { templateId_date: { templateId, date: selectedDate } },
            include: { createdBy: true },
          })
        : null,
      selectedDate
        ? prisma.enrolmentAdjustment.findMany({
            where: {
              templateId,
              date: selectedDate,
              type: EnrolmentAdjustmentType.CANCELLATION_CREDIT,
            },
            include: { enrolment: { include: { student: true, plan: true } } },
            orderBy: [{ enrolment: { student: { name: "asc" } } }],
          })
        : [],
    ]);

  const roster =
    selectedDateKey && selectedDate ? await getClassOccurrenceRoster(templateId, selectedDateKey) : null;

  const effectiveTeacher = substitution?.teacher ?? template.teacher ?? null;

  return {
    template,
    enrolmentsForDate: roster?.enrolments ?? [],
    selectedDateKey,
    requestedDateKey: requestedDateKey ?? null,
    availableDateKeys: includeDateIfMissing(availableDateKeys, selectedDateKey),
    requestedDateValid,
    teacherSubstitution: substitution,
    effectiveTeacher,
    attendance: roster?.attendance ?? [],
    cancellation,
    cancellationCredits,
    teachers,
    levels,
    students,
    enrolmentPlans,
    roster,
  };
}

function includeDateIfMissing(dateKeys: string[], maybeDateKey: string | null) {
  if (!maybeDateKey) return dateKeys;
  if (dateKeys.includes(maybeDateKey)) return dateKeys;
  return [...dateKeys, maybeDateKey].sort();
}

function isValidOccurrenceDate(template: ClientTemplateWithInclusions, date: Date | null) {
  if (!date) return false;
  if (template.dayOfWeek === null || typeof template.dayOfWeek === "undefined") return false;
  const start = brisbaneStartOfDay(template.startDate);
  const end = template.endDate ? brisbaneStartOfDay(template.endDate) : null;
  const matchesDay = brisbaneDayOfWeek(date) === template.dayOfWeek;
  const afterStart = !isAfter(start, date);
  const beforeEnd = end ? !isBefore(end, date) : true;
  return matchesDay && afterStart && beforeEnd;
}

function buildRecentOccurrenceDateKeys(template: ClientTemplateWithInclusions, requestedDate: Date | null): string[] {
  if (template.dayOfWeek === null || typeof template.dayOfWeek === "undefined") return [];

  const startDate = brisbaneStartOfDay(template.startDate);
  const today = brisbaneStartOfDay(new Date());
  const endDate = template.endDate ? brisbaneStartOfDay(template.endDate) : addDays(today, 28);

  const firstOccurrence = nextMatchingDay(startDate, template.dayOfWeek);
  const dates: string[] = [];

  for (
    let cursor = firstOccurrence;
    !isAfter(cursor, endDate) && dates.length < 40;
    cursor = addDays(cursor, 7)
  ) {
    dates.push(toBrisbaneDayKey(cursor));
  }

  if (requestedDate) {
    const requestedKey = toBrisbaneDayKey(requestedDate);
    if (!dates.includes(requestedKey)) dates.push(requestedKey);
  }

  dates.sort();
  const cutoffTarget = dates.findIndex((d) => !isBeforeDateKey(d, toBrisbaneDayKey(today)));
  if (cutoffTarget === -1) {
    return dates.slice(-8);
  }

  const endSlice = Math.min(dates.length, cutoffTarget + 3);
  const startSlice = Math.max(0, endSlice - 8);
  return dates.slice(startSlice, endSlice);
}

function isBeforeDateKey(a: string, b: string) {
  const aDate = parseDateKey(a);
  const bDate = parseDateKey(b);
  if (!aDate || !bDate) return false;
  return isBefore(aDate, bDate);
}

function nextMatchingDay(start: Date, targetDow: number) {
  const target = ((targetDow % 7) + 7) % 7; // normalize
  let cursor = brisbaneStartOfDay(start);
  while (brisbaneDayOfWeek(cursor) !== target) {
    cursor = addDays(cursor, 1);
  }
  return cursor;
}
