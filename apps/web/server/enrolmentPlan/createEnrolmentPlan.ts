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

export async function createEnrolmentPlan(input: EnrolmentPlanInput) {
  await getOrCreateUser();
  await requireAdmin();

  const plan = await prisma.enrolmentPlan.create({
    data: {
      name: input.name,
      priceCents: input.priceCents,
      levelId: input.levelId,
      billingType: input.billingType,
      enrolmentType: input.enrolmentType,
      blockLength: input.blockLength,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/enrolment-plans");
  return plan;
}
