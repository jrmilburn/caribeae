"use server";

import { PayRunStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Audit-first notes:
 * - Pay run transitions: DRAFT -> LOCKED -> PAID. We permit PAID from LOCKED.
 */

const schema = z.object({
  id: z.string().min(1),
});

export async function markPayRunPaid(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();
  const payload = schema.parse(input);

  const payRun = await prisma.payRun.findUnique({ where: { id: payload.id } });
  if (!payRun) throw new Error("Pay run not found.");
  if (payRun.status !== PayRunStatus.LOCKED) {
    throw new Error("Only locked pay runs can be marked paid.");
  }

  return prisma.payRun.update({
    where: { id: payRun.id },
    data: { status: PayRunStatus.PAID },
  });
}
