import { addHours, isAfter } from "date-fns";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { brisbaneDayOfWeek, brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { dateAtMinutesLocal } from "@/server/schedule/rangeUtils";
import { holidayAppliesToTemplate, holidayRangeIncludesDayKey } from "@/server/holiday/holidayUtils";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

export type TemplateSessionState = {
  template: {
    id: string;
    name: string | null;
    levelId: string;
    dayOfWeek: number | null;
    startDate: Date;
    endDate: Date | null;
    startTime: number | null;
    endTime: number | null;
    active: boolean;
    capacity: number | null;
    level: { id: string; name: string; defaultCapacity: number | null } | null;
  };
  sessionDate: Date;
  sessionDateKey: string;
  sessionStart: Date | null;
  isDayMatch: boolean;
  isWithinTemplateRange: boolean;
  isHoliday: boolean;
  isCancelled: boolean;
};

export async function getTemplateSessionState(
  params: {
    templateId: string;
    sessionDate: Date;
    client?: PrismaClientLike;
  }
): Promise<TemplateSessionState> {
  const tx = params.client ?? prisma;
  const sessionDate = brisbaneStartOfDay(params.sessionDate);
  const sessionDateKey = toBrisbaneDayKey(sessionDate);

  const template = await tx.classTemplate.findUnique({
    where: { id: params.templateId },
    select: {
      id: true,
      name: true,
      levelId: true,
      dayOfWeek: true,
      startDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
      active: true,
      capacity: true,
      level: { select: { id: true, name: true, defaultCapacity: true } },
    },
  });

  if (!template) {
    throw new Error("Class template not found.");
  }

  const sessionStart = typeof template.startTime === "number" ? dateAtMinutesLocal(sessionDate, template.startTime) : null;

  const isDayMatch = template.dayOfWeek !== null && brisbaneDayOfWeek(sessionDate) === template.dayOfWeek;
  const isWithinTemplateRange =
    !isAfter(brisbaneStartOfDay(template.startDate), sessionDate) &&
    (template.endDate ? !isAfter(sessionDate, brisbaneStartOfDay(template.endDate)) : true);

  const [holiday, cancellation] = await Promise.all([
    tx.holiday.findFirst({
      where: {
        startDate: { lte: sessionDate },
        endDate: { gte: sessionDate },
        OR: [
          { levelId: null, templateId: null },
          { templateId: template.id },
          { levelId: template.levelId },
        ],
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        levelId: true,
        templateId: true,
      },
    }),
    tx.classCancellation.findUnique({
      where: { templateId_date: { templateId: template.id, date: sessionDate } },
      select: { id: true },
    }),
  ]);

  const isHoliday =
    holiday !== null
      ? holidayAppliesToTemplate(holiday, { id: template.id, levelId: template.levelId }) &&
        holidayRangeIncludesDayKey(holiday, sessionDateKey)
      : false;

  return {
    template,
    sessionDate,
    sessionDateKey,
    sessionStart,
    isDayMatch,
    isWithinTemplateRange,
    isHoliday,
    isCancelled: Boolean(cancellation),
  };
}

export function isPastNoticeCutoff(params: { sessionStart: Date | null; now: Date; cutoffHours: number }) {
  if (!params.sessionStart) return false;
  const cutoff = addHours(params.sessionStart, -params.cutoffHours);
  return isAfter(params.now, cutoff);
}
