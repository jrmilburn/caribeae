"use server";

import { PayRunStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Audit-first notes:
 * - Unlink only allowed while the pay run is DRAFT; locked/paid entries must be adjusted via retro adjustments.
 */

const schema = z.object({
  entryId: z.string().min(1),
});

export async function unlinkEntryFromPayRun(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();
  const payload = schema.parse(input);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.teacherTimesheetEntry.findUnique({
      where: { id: payload.entryId },
      select: { payRunId: true },
    });
    if (!entry?.payRunId) return null;

    const payRun = await tx.payRun.findUnique({ where: { id: entry.payRunId }, select: { status: true } });
    if (!payRun) return null;
    if (payRun.status !== PayRunStatus.DRAFT) {
      throw new Error("Cannot unlink from a locked pay run.");
    }

    return tx.teacherTimesheetEntry.update({
      where: { id: payload.entryId },
      data: { payRunId: null },
    });
  });
}
