"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const inputSchema = z.object({
  familyId: z.string().min(1),
});

export async function getFamilyAwayPeriods(familyId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const parsed = inputSchema.parse({ familyId });

  return prisma.awayPeriod.findMany({
    where: {
      familyId: parsed.familyId,
      deletedAt: null,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          clerkId: true,
        },
      },
      impacts: {
        select: {
          id: true,
          enrolmentId: true,
          missedOccurrences: true,
          paidThroughDeltaDays: true,
        },
      },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
  });
}
