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
  sessionsPerWeek?: number | null;
  isSaturdayOnly?: boolean;
};

export async function createEnrolmentPlan(input: EnrolmentPlanInput) {
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
    sessionsPerWeek: z.number().int().positive().optional().nullable(),
    isSaturdayOnly: z.boolean().optional(),
  });

  const parsed = schema.parse(input);
  const requiresDuration = parsed.billingType === "PER_WEEK";
  const requiresBlockCount = parsed.billingType === "PER_CLASS";
  if (requiresDuration && !parsed.durationWeeks) {
    throw new Error("Weekly plans must include durationWeeks");
  }
  if (requiresBlockCount && !parsed.blockClassCount) {
    throw new Error("Per-class plans must include the number of classes");
  }

  const plan = await prisma.enrolmentPlan.create({
    data: {
      name: parsed.name,
      priceCents: parsed.priceCents,
      levelId: parsed.levelId,
      billingType: parsed.billingType,
      enrolmentType: parsed.enrolmentType,
      durationWeeks: requiresDuration ? parsed.durationWeeks ?? null : null,
      sessionsPerWeek: parsed.sessionsPerWeek ?? null,
      blockClassCount:
        parsed.billingType === "PER_CLASS"
          ? parsed.blockClassCount ?? 1
          : null,
      blockLength: parsed.blockClassCount ?? 1,
      isSaturdayOnly: Boolean(parsed.isSaturdayOnly),
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/enrolment-plans");
  return plan;
}
