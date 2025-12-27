"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { BillingType, EnrolmentType } from "@prisma/client";
import { z } from "zod";

type EnrolmentPlanInput = {
  name: string;
  priceCents: number;
  levelId: string;
  billingType: BillingType;
  enrolmentType: EnrolmentType;
  durationWeeks?: number | null;
  blockClassCount?: number | null;
};

export async function updateEnrolmentPlan(id: string, input: EnrolmentPlanInput) {
  await getOrCreateUser();
  await requireAdmin();

  const schema = z.object({
    name: z.string().min(1),
    priceCents: z.number().int().positive(),
    levelId: z.string().min(1),
    billingType: z.nativeEnum(BillingType),
    enrolmentType: z.nativeEnum(EnrolmentType),
    durationWeeks: z.number().int().positive().optional().nullable(),
    blockClassCount: z.number().int().positive().optional().nullable(),
  });
  const parsed = schema.parse(input);
  const requiresDuration = parsed.billingType === "PER_WEEK";
  const requiresBlockCount = parsed.billingType === "BLOCK";
  if (requiresDuration && !parsed.durationWeeks) {
    throw new Error("Weekly plans must include durationWeeks");
  }
  if (requiresBlockCount && !parsed.blockClassCount) {
    throw new Error("Block plans must include the number of classes");
  }

  const plan = await prisma.enrolmentPlan.update({
    where: { id },
    data: {
      name: parsed.name,
      priceCents: parsed.priceCents,
      levelId: parsed.levelId,
      billingType: parsed.billingType,
      enrolmentType: parsed.enrolmentType,
      durationWeeks: requiresDuration ? parsed.durationWeeks ?? null : null,
      blockClassCount:
        parsed.billingType === "PER_CLASS"
          ? parsed.blockClassCount ?? 1
          : requiresBlockCount
            ? parsed.blockClassCount
            : null,
      blockLength:
        parsed.billingType === "BLOCK"
          ? parsed.blockClassCount ?? 1
          : parsed.billingType === "PER_CLASS"
            ? parsed.blockClassCount ?? 1
            : 1,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/enrolment-plans");
  return plan;
}
