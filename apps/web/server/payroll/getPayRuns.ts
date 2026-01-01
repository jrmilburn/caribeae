"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Audit-first notes:
 * - Keep queries lean; only include fields needed for list view (grossCents, line counts).
 */

export async function getPayRuns() {
  await getOrCreateUser();
  await requireAdmin();

  const runs = await prisma.payRun.findMany({
    orderBy: { periodStart: "desc" },
    include: {
      _count: { select: { lines: true, entries: true } },
    },
  });

  return runs;
}
