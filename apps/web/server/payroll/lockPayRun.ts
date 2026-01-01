"use server";

import { PayRunStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Audit-first notes:
 * - Locking prevents further edits; entries are already linked in generatePayRunLines. We only allow locking when status is DRAFT.
 * - Retro adjustments in the period are marked applied to maintain audit integrity.
 */

const schema = z.object({
  id: z.string().min(1),
});

export async function lockPayRun(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();
  const payload = schema.parse(input);

  return prisma.$transaction(async (tx) => {
    const payRun = await tx.payRun.findUnique({ where: { id: payload.id } });
    if (!payRun) throw new Error("Pay run not found.");
    if (payRun.status !== PayRunStatus.DRAFT) {
      throw new Error("Only draft pay runs can be locked.");
    }

    const lines = await tx.payRunLine.count({ where: { payRunId: payRun.id } });
    if (lines === 0) {
      throw new Error("Generate pay run lines before locking.");
    }

    await tx.payrollAdjustment.updateMany({
      where: {
        appliedPayRunId: null,
        date: { gte: payRun.periodStart, lte: payRun.periodEnd },
      },
      data: { appliedPayRunId: payRun.id },
    });

    return tx.payRun.update({
      where: { id: payRun.id },
      data: { status: PayRunStatus.LOCKED },
      include: { lines: { include: { teacher: true } } },
    });
  });
}
