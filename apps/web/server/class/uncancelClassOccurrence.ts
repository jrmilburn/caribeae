"use server";

import { EnrolmentAdjustmentType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import { removeCancellationCredit } from "@/server/billing/enrolmentBilling";
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
      include: { enrolment: { include: { plan: true, template: true } } },
    });

    for (const adj of adjustments) {
      await removeCancellationCredit(adj, { client: tx });
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
