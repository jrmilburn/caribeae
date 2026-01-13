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

export async function updateHoliday(id: string, input: z.input<typeof payloadSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = payloadSchema.parse(input);
  const startDate = brisbaneStartOfDay(payload.startDate);
  const endDate = brisbaneStartOfDay(payload.endDate);
  const levelId = payload.levelId?.trim() || null;
  const templateId = payload.templateId?.trim() || null;

  if (levelId && templateId) {
    throw new Error("Select at most one holiday scope.");
  }

  if (endDate < startDate) {
    throw new Error("End date must be on or after start date.");
  }

  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Holiday not found.");
  }

  const holiday = await prisma.holiday.update({
    where: { id },
    data: {
      name: payload.name.trim(),
      startDate,
      endDate,
      note: payload.note?.trim() || null,
      levelId,
      templateId,
    },
  });

  await recomputeHolidayEnrolments(
    [
      {
        startDate: existing.startDate,
        endDate: existing.endDate,
        levelId: existing.levelId,
        templateId: existing.templateId,
      },
      { startDate, endDate, levelId, templateId },
    ],
    "HOLIDAY_UPDATED"
  );

  revalidatePath("/admin/holidays");
  revalidatePath("/admin/settings/holidays");
  revalidatePath("/admin/schedule");

  return holiday;
}
