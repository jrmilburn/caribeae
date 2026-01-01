"use server";

import { startOfDay } from "date-fns";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizeLocalDate } from "@/server/timesheet/normalizeLocalDate";

/**
 * Audit-first notes:
 * - Retro adjustments live outside locked entries; they are applied to the next pay run via generatePayRunLines.
 * - Dates normalized to local midnight to align with timesheet/pay run windows.
 */

const schema = z.object({
  teacherId: z.string().min(1),
  date: z.union([z.date(), z.string()]),
  minutesDelta: z.number().int(),
  centsDelta: z.number().int().default(0),
  reason: z.string().trim().optional(),
});

export type CreatePayrollAdjustmentInput = z.infer<typeof schema>;

export async function createPayrollAdjustment(input: CreatePayrollAdjustmentInput) {
  const user = await getOrCreateUser();
  await requireAdmin();
  const payload = schema.parse(input);

  const date = startOfDay(normalizeLocalDate(payload.date));

  return prisma.payrollAdjustment.create({
    data: {
      teacherId: payload.teacherId,
      date,
      minutesDelta: payload.minutesDelta,
      centsDelta: payload.centsDelta,
      reason: payload.reason ?? null,
      createdById: user.id,
    },
  });
}
