"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Audit-first notes:
 * - Lines include teacher to show names; entries include template for drilldown.
 * - We avoid N+1 by including needed relations in a single query.
 */

export async function getPayRunDetail(id: string) {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.payRun.findUnique({
    where: { id },
    include: {
      lines: {
        include: { teacher: true },
        orderBy: { teacher: { name: "asc" } },
      },
      entries: {
        include: {
          template: { include: { level: true } },
          teacher: true,
        },
        orderBy: [{ date: "asc" }],
      },
    },
  });
}
