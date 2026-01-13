import { EnrolmentStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  brisbaneAddDays,
  brisbaneCompare,
  brisbaneDayOfWeek,
  brisbaneStartOfDay,
  toBrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import { recalculateEnrolmentCoverage } from "@/server/billing/recalculateEnrolmentCoverage";
import type { HolidayRange } from "./holidayUtils";

const BATCH_SIZE = 25;

type HolidayScope = HolidayRange & { levelId?: string | null; templateId?: string | null };

export async function recomputeHolidayEnrolments(
  holidays: HolidayScope[],
  reason: "HOLIDAY_ADDED" | "HOLIDAY_REMOVED" | "HOLIDAY_UPDATED" = "HOLIDAY_UPDATED"
) {
  if (!holidays.length) return;

  const normalized = holidays.map((holiday) => ({
    ...holiday,
    startDate: brisbaneStartOfDay(holiday.startDate),
    endDate: brisbaneStartOfDay(holiday.endDate),
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

  const templateIds = new Set<string>();
  const levelIds = new Set<string>();
  let hasGlobal = false;

  normalized.forEach((holiday) => {
    if (holiday.templateId) {
      templateIds.add(holiday.templateId);
      return;
    }
    if (holiday.levelId) {
      levelIds.add(holiday.levelId);
      return;
    }
    hasGlobal = true;
  });

  const scopeClauses: Prisma.EnrolmentWhereInput[] = [];

  if (templateIds.size) {
    const ids = Array.from(templateIds);
    scopeClauses.push({
      OR: [{ templateId: { in: ids } }, { classAssignments: { some: { templateId: { in: ids } } } }],
    });
  }

  if (levelIds.size) {
    const ids = Array.from(levelIds);
    scopeClauses.push({
      OR: [
        { template: { levelId: { in: ids } } },
        { classAssignments: { some: { template: { levelId: { in: ids } } } } },
      ],
    });
  }

  if (hasGlobal) {
    if (!dayOfWeekSet.size) return;
    const days = Array.from(dayOfWeekSet);
    scopeClauses.push({
      OR: [
        { template: { dayOfWeek: { in: days } } },
        { classAssignments: { some: { template: { dayOfWeek: { in: days } } } } },
      ],
    });
  }

  if (!scopeClauses.length) return;

  const enrolments = await prisma.enrolment.findMany({
    where: {
      status: EnrolmentStatus.ACTIVE,
      startDate: { lte: maxEnd },
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: minStart } }] }, { OR: scopeClauses }],
    },
    select: { id: true },
  });

  for (let i = 0; i < enrolments.length; i += BATCH_SIZE) {
    const batch = enrolments.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((enrolment) => recalculateEnrolmentCoverage(enrolment.id, reason, { actorId: undefined }))
    );
  }
}
