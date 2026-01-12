import { EnrolmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  brisbaneAddDays,
  brisbaneCompare,
  brisbaneDayOfWeek,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import { recomputeEnrolmentCoverage } from "@/server/billing/recomputeEnrolmentCoverage";
import type { HolidayRange } from "./holidayUtils";

const BATCH_SIZE = 25;

export async function recomputeHolidayEnrolments(
  ranges: HolidayRange[],
  reason: "HOLIDAY_ADDED" | "HOLIDAY_REMOVED" | "HOLIDAY_UPDATED" = "HOLIDAY_UPDATED"
) {
  if (!ranges.length) return;

  const normalized = ranges.map((range) => ({
    startDate: brisbaneStartOfDay(range.startDate),
    endDate: brisbaneStartOfDay(range.endDate),
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
    let cursor = toBrisbaneDayKey(range.startDate);
    const end = toBrisbaneDayKey(range.endDate);
    while (brisbaneCompare(cursor, end) <= 0) {
      dayOfWeekSet.add(brisbaneDayOfWeek(cursor));
      cursor = brisbaneAddDays(cursor, 1);
    }
  });

  if (!dayOfWeekSet.size) return;

  const enrolments = await prisma.enrolment.findMany({
    where: {
      status: EnrolmentStatus.ACTIVE,
      OR: [
        { template: { dayOfWeek: { in: Array.from(dayOfWeekSet) } } },
        { classAssignments: { some: { template: { dayOfWeek: { in: Array.from(dayOfWeekSet) } } } } },
        { endDate: null }, { endDate: { gte: minStart } }
      ],
      startDate: { lte: maxEnd },
    },
    select: { id: true },
  });

  for (let i = 0; i < enrolments.length; i += BATCH_SIZE) {
    const batch = enrolments.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((enrolment) => recomputeEnrolmentCoverage(enrolment.id, reason))
    );
  }
}
