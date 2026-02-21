import { MakeupCreditStatus, Prisma } from "@prisma/client";

import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

export async function assertNoMakeupCreditsInAwayRange(
  tx: Prisma.TransactionClient,
  params: {
    familyId: string;
    studentId: string | null;
    startDate: Date;
    endDate: Date;
    excludeCreditId?: string;
  }
) {
  const conflict = await tx.makeupCredit.findFirst({
    where: {
      familyId: params.familyId,
      studentId: params.studentId ?? undefined,
      earnedFromSessionDate: {
        gte: brisbaneStartOfDay(params.startDate),
        lte: brisbaneStartOfDay(params.endDate),
      },
      status: { not: MakeupCreditStatus.CANCELLED },
      ...(params.excludeCreditId ? { id: { not: params.excludeCreditId } } : {}),
    },
    select: { id: true },
  });

  if (conflict) {
    throw new Error("This absence already has a makeup credit; remove/cancel it before marking as Away.");
  }
}
