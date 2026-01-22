import { BillingType, EnrolmentStatus, type Prisma } from "@prisma/client";
import { isAfter } from "date-fns";

import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

export async function autoAssignWeeklyEnrolmentsToTemplate(params: {
  tx: Prisma.TransactionClient;
  templateId: string;
  levelId: string;
  asOfDate?: Date;
}) {
  const today = brisbaneStartOfDay(params.asOfDate ?? new Date());

  const candidates = await params.tx.enrolment.findMany({
    where: {
      status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] },
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
      plan: { is: { billingType: BillingType.PER_WEEK } },
      AND: [
        {
          OR: [
            { student: { levelId: params.levelId } },
            { plan: { is: { levelId: params.levelId } } },
          ],
        },
      ],
    },
    select: { id: true, paidThroughDate: true, paidThroughDateComputed: true },
  });

  const eligible = candidates.filter((enrolment) => {
    const paidThrough = enrolment.paidThroughDate ?? null;
    if (paidThrough && isAfter(today, brisbaneStartOfDay(paidThrough))) {
      return false;
    }
    return true;
  });

  if (!eligible.length) return { assignedCount: 0 };

  await params.tx.enrolmentClassAssignment.createMany({
    data: eligible.map((enrolment) => ({
      enrolmentId: enrolment.id,
      templateId: params.templateId,
    })),
    skipDuplicates: true,
  });

  return { assignedCount: eligible.length };
}
