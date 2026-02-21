import { MakeupCreditStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

export async function expireMakeupCredits(
  params?: {
    asOf?: Date;
    client?: PrismaClientLike;
  }
) {
  const tx = params?.client ?? prisma;
  const asOf = brisbaneStartOfDay(params?.asOf ?? new Date());

  return tx.makeupCredit.updateMany({
    where: {
      status: { in: [MakeupCreditStatus.AVAILABLE, MakeupCreditStatus.RESERVED] },
      expiresAt: { lt: asOf },
    },
    data: {
      status: MakeupCreditStatus.EXPIRED,
    },
  });
}

export async function getFamilyMakeups(
  familyId: string,
  options?: {
    includeCancelled?: boolean;
    client?: PrismaClientLike;
  }
) {
  const tx = options?.client ?? prisma;
  await expireMakeupCredits({ client: tx });

  const where: Prisma.MakeupCreditWhereInput = {
    familyId,
    ...(options?.includeCancelled ? {} : { status: { not: MakeupCreditStatus.CANCELLED } }),
  };

  const credits = await tx.makeupCredit.findMany({
    where,
    include: {
      student: {
        select: {
          id: true,
          name: true,
          level: { select: { id: true, name: true } },
        },
      },
      earnedFromClass: {
        select: {
          id: true,
          name: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          levelId: true,
        },
      },
      level: {
        select: {
          id: true,
          name: true,
        },
      },
      booking: {
        include: {
          targetClass: {
            select: {
              id: true,
              name: true,
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              levelId: true,
            },
          },
        },
      },
    },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
  });

  const availableCount = credits.filter((credit) => credit.status === MakeupCreditStatus.AVAILABLE).length;

  return {
    credits,
    availableCount,
  };
}

export type FamilyMakeupSummary = Awaited<ReturnType<typeof getFamilyMakeups>>;
