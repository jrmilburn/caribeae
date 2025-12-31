"use server";

import { TimesheetStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const inputSchema = z.object({
  entryId: z.string().min(1),
  minutesDelta: z.number().int(),
  reason: z.string().trim().min(1).optional(),
});

export type CreateTimesheetAdjustmentInput = z.infer<typeof inputSchema>;

export async function createTimesheetAdjustment(input: CreateTimesheetAdjustmentInput) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = inputSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.teacherTimesheetEntry.findUnique({
      where: { id: payload.entryId },
      select: {
        id: true,
        status: true,
        minutesBase: true,
        minutesFinal: true,
        minutesAdjustment: true,
      },
    });
    if (!entry) throw new Error("Timesheet entry not found");

    await tx.teacherTimesheetAdjustment.create({
      data: {
        entryId: payload.entryId,
        minutesDelta: payload.minutesDelta,
        reason: payload.reason ?? null,
        createdById: user.id,
      },
    });

    const totals = await tx.teacherTimesheetAdjustment.aggregate({
      where: { entryId: payload.entryId },
      _sum: { minutesDelta: true },
    });
    const minutesAdjustment = totals._sum.minutesDelta ?? 0;
    const minutesFinal =
      entry.status === TimesheetStatus.CANCELLED ? 0 : entry.minutesBase + minutesAdjustment;

    const updatedEntry = await tx.teacherTimesheetEntry.update({
      where: { id: payload.entryId },
      data: {
        minutesAdjustment,
        minutesFinal,
      },
      include: {
        template: { include: { level: true } },
        teacher: true,
        adjustments: true,
      },
    });

    return updatedEntry;
  });
}
