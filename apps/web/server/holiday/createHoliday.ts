"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { recomputeHolidayEnrolments } from "./recomputeHolidayEnrolments";

const payloadSchema = z.object({
  name: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  note: z.string().optional().nullable(),
  levelId: z.string().optional().nullable(),
  templateId: z.string().optional().nullable(),
});

const mutationOptionsSchema = z
  .object({
    recalculatePaidThroughDates: z.boolean().optional(),
  })
  .optional();

export async function createHoliday(
  input: z.input<typeof payloadSchema>,
  rawOptions?: z.input<typeof mutationOptionsSchema>
) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = payloadSchema.parse(input);
  const options = mutationOptionsSchema.parse(rawOptions);
  const startDate = brisbaneStartOfDay(payload.startDate);
  const endDate = brisbaneStartOfDay(payload.endDate);
  const levelId = payload.levelId?.trim() || null;
  const templateId = payload.templateId?.trim() || null;
  const shouldRecalculatePaidThroughDates = options?.recalculatePaidThroughDates !== false;

  if (levelId && templateId) {
    throw new Error("Select at most one holiday scope.");
  }

  if (endDate < startDate) {
    throw new Error("End date must be on or after start date.");
  }

  const holiday = await prisma.$transaction(async (tx) => {
    const createdHoliday = await tx.holiday.create({
      data: {
        name: payload.name.trim(),
        startDate,
        endDate,
        note: payload.note?.trim() || null,
        levelId,
        templateId,
      },
    });

    if (shouldRecalculatePaidThroughDates) {
      await recomputeHolidayEnrolments([{ startDate, endDate, levelId, templateId }], "HOLIDAY_ADDED", {
        tx,
      });
    }

    return createdHoliday;
  });

  revalidatePath("/admin/holidays");
  revalidatePath("/admin/settings/holidays");
  revalidatePath("/admin/schedule");

  return holiday;
}
