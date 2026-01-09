"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { normalizeToLocalMidnight } from "@/lib/dateUtils";
import { recomputeHolidayEnrolments } from "./recomputeHolidayEnrolments";

const payloadSchema = z.object({
  name: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  note: z.string().optional().nullable(),
});

export async function updateHoliday(id: string, input: z.input<typeof payloadSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = payloadSchema.parse(input);
  const startDate = normalizeToLocalMidnight(payload.startDate);
  const endDate = normalizeToLocalMidnight(payload.endDate);

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
    },
  });

  await recomputeHolidayEnrolments([
    { startDate: existing.startDate, endDate: existing.endDate },
    { startDate, endDate },
  ]);

  revalidatePath("/admin/holidays");
  revalidatePath("/admin/schedule");

  return holiday;
}
