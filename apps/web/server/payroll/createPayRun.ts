"use server";

import { startOfDay } from "date-fns";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

/**
 * Audit-first notes:
 * - Timesheet date normalization uses startOfDay(parseISO); we mirror that for pay run periods.
 * - Teacher hours already track cancellations/substitutions and adjustments inside minutesFinal; pay runs must not mutate entries unless explicitly unlinking while DRAFT.
 * - Auth/guardrails match other server actions (getOrCreateUser + requireAdmin).
 * - Overlap prevention mirrors other range checks: we block any non-VOID pay run that overlaps the requested window.
 */

const schema = z.object({
  periodStart: z.union([z.date(), z.string()]),
  periodEnd: z.union([z.date(), z.string()]),
});

export type CreatePayRunInput = z.infer<typeof schema>;

export async function createPayRun(input: CreatePayRunInput) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);
  const periodStart = startOfDay(normalizeLocalDate(payload.periodStart));
  const periodEnd = startOfDay(normalizeLocalDate(payload.periodEnd));
  if (periodEnd < periodStart) {
    throw new Error("Period end must be on or after period start.");
  }

  const overlapping = await prisma.payRun.findFirst({
    where: {
      status: { not: "VOID" },
      NOT: [
        { periodEnd: { lt: periodStart } },
        { periodStart: { gt: periodEnd } },
      ],
    },
  });
  if (overlapping) {
    throw new Error("A pay run already exists for an overlapping period.");
  }

  return prisma.payRun.create({
    data: {
      periodStart,
      periodEnd,
      createdById: user.id,
    },
  });
}
