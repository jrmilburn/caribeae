"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getEnrolmentPlans() {
  await getOrCreateUser();
  await requireAdmin();

  const plans = await prisma.enrolmentPlan.findMany({
    include: { level: true },
    orderBy: { createdAt: "asc" },
  });

  return plans;
}
