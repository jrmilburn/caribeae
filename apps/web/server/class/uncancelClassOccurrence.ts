"use server";

import { addDays, startOfDay } from "date-fns";
import { EnrolmentAdjustmentType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import { upsertTimesheetEntryForOccurrence } from "@/server/timesheet/upsertTimesheetEntryForOccurrence";

type UncancelInput = {
  templateId: string;
  dateKey: string;
};

export async function uncancelClassOccurrence({ templateId, dateKey }: UncancelInput) {
  await getOrCreateUser();
  await requireAdmin();

  const date = parseDateKey(dateKey);
  if (!date) throw new Error("Invalid date");

  const result = await prisma.$transaction(async (tx) => {
    const cancellation = await tx.classCancellation.findUnique({
      where: { templateId_date: { templateId, date } },
    });
    if (!cancellation) {
      return { removed: false };
    }

    const adjustments = await tx.enrolmentAdjustment.findMany({
      where: { templateId, date, type: EnrolmentAdjustmentType.CANCELLATION_CREDIT },
      include: { enrolment: true },
    });

    for (const adj of adjustments) {
      if (adj.creditsDelta) {
        await tx.enrolment.update({
          where: { id: adj.enrolmentId },
          data: {
            creditsRemaining: Math.max(0, (adj.enrolment.creditsRemaining ?? 0) - adj.creditsDelta),
          },
        });
      } else if (adj.paidThroughDeltaDays) {
        const current = startOfDay(adj.enrolment.paidThroughDate ?? date);
        const next = addDays(current, -adj.paidThroughDeltaDays);
        const minDate = adj.enrolment.startDate ? startOfDay(adj.enrolment.startDate) : null;
        const safeDate = minDate && next < minDate ? minDate : next;

        await tx.enrolment.update({
          where: { id: adj.enrolmentId },
          data: { paidThroughDate: safeDate },
        });
      }
    }

    await tx.enrolmentAdjustment.deleteMany({
      where: { templateId, date, type: EnrolmentAdjustmentType.CANCELLATION_CREDIT },
    });

    await tx.classCancellation.delete({ where: { templateId_date: { templateId, date } } });

    return { removed: true, adjustmentsRemoved: adjustments.length };
  });

  await upsertTimesheetEntryForOccurrence({ templateId, date });
  return result;
}
