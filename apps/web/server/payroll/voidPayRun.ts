"use server";

import { PayRunStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Audit-first notes:
 * - Voiding is only allowed while DRAFT. It unlinks entries and removes lines to avoid leaving stale payRunId pointers.
 */

const schema = z.object({
  id: z.string().min(1),
});

export async function voidPayRun(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();
  const payload = schema.parse(input);

  return prisma.$transaction(async (tx) => {
    const payRun = await tx.payRun.findUnique({ where: { id: payload.id } });
    if (!payRun) throw new Error("Pay run not found.");
    if (payRun.status !== PayRunStatus.DRAFT) {
      throw new Error("Only draft pay runs can be voided.");
    }

    await tx.teacherTimesheetEntry.updateMany({
      where: { payRunId: payRun.id },
      data: { payRunId: null },
    });
    await tx.payRunLine.deleteMany({ where: { payRunId: payRun.id } });

    return tx.payRun.update({
      where: { id: payRun.id },
      data: { status: PayRunStatus.VOID, grossCents: 0 },
    });
  });
}
