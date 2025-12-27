"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import type { BillingType, EnrolmentType } from "@prisma/client";

type EnrolmentPlanInput = {
  name: string;
  priceCents: number;
  levelId: string;
  billingType: BillingType;
  enrolmentType: EnrolmentType;
  blockLength: number;
};

export async function updateEnrolmentPlan(id: string, input: EnrolmentPlanInput) {
  await getOrCreateUser();
  await requireAdmin();

  const plan = await prisma.enrolmentPlan.update({
    where: { id },
    data: {
      name: input.name,
      priceCents: input.priceCents,
      levelId: input.levelId,
      billingType: input.billingType,
      enrolmentType: input.enrolmentType,
      blockLength: input.blockLength,
    },
  });

  revalidatePath("/admin/enrolment-plans");
  return plan;
}
