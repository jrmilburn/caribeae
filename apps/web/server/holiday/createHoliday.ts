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
});

export async function createHoliday(input: z.input<typeof payloadSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = payloadSchema.parse(input);
  const startDate = brisbaneStartOfDay(payload.startDate);
  const endDate = brisbaneStartOfDay(payload.endDate);

  if (endDate < startDate) {
    throw new Error("End date must be on or after start date.");
  }

  const holiday = await prisma.holiday.create({
    data: {
      name: payload.name.trim(),
      startDate,
      endDate,
      note: payload.note?.trim() || null,
    },
  });

  await recomputeHolidayEnrolments([{ startDate, endDate }], "HOLIDAY_ADDED");

  revalidatePath("/admin/holidays");
  revalidatePath("/admin/settings/holidays");
  revalidatePath("/admin/schedule");

  return holiday;
}
