"use server";

import { revalidatePath } from "next/cache";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { recomputeHolidayEnrolments } from "./recomputeHolidayEnrolments";

export async function deleteHoliday(id: string) {
  await getOrCreateUser();
  await requireAdmin();

  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) {
    throw new Error("Holiday not found.");
  }

  await prisma.holiday.delete({ where: { id } });

  await recomputeHolidayEnrolments([{ startDate: existing.startDate, endDate: existing.endDate }]);

  revalidatePath("/admin/holidays");
  revalidatePath("/admin/settings/holidays");
  revalidatePath("/admin/schedule");
}
