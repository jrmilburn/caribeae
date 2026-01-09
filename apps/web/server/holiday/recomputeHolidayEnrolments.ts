import { EnrolmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { enumerateDatesInclusive, normalizeToLocalMidnight, toTemplateDayOfWeek } from "@/lib/dateUtils";
import { recomputeEnrolmentComputedFields } from "@/server/billing/enrolmentBilling";
import type { HolidayRange } from "./holidayUtils";

const BATCH_SIZE = 25;

export async function recomputeHolidayEnrolments(ranges: HolidayRange[]) {
  if (!ranges.length) return;

  const normalized = ranges.map((range) => ({
    startDate: normalizeToLocalMidnight(range.startDate),
    endDate: normalizeToLocalMidnight(range.endDate),
  }));

  const minStart = normalized.reduce(
    (min, range) => (range.startDate < min ? range.startDate : min),
    normalized[0]?.startDate ?? new Date()
  );
  const maxEnd = normalized.reduce(
    (max, range) => (range.endDate > max ? range.endDate : max),
    normalized[0]?.endDate ?? new Date()
  );

  const dayOfWeekSet = new Set<number>();
  normalized.forEach((range) => {
    enumerateDatesInclusive(range.startDate, range.endDate).forEach((date) => {
      dayOfWeekSet.add(toTemplateDayOfWeek(date));
    });
  });

  if (!dayOfWeekSet.size) return;

  const enrolments = await prisma.enrolment.findMany({
    where: {
      status: EnrolmentStatus.ACTIVE,
      template: { dayOfWeek: { in: Array.from(dayOfWeekSet) } },
      startDate: { lte: maxEnd },
      OR: [{ endDate: null }, { endDate: { gte: minStart } }],
    },
    select: { id: true },
  });

  for (let i = 0; i < enrolments.length; i += BATCH_SIZE) {
    const batch = enrolments.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((enrolment) => recomputeEnrolmentComputedFields(enrolment.id)));
  }
}
