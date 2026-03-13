"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { recomputeHolidayEnrolments } from "./recomputeHolidayEnrolments";

const mutationOptionsSchema = z
  .object({
    recalculatePaidThroughDates: z.boolean().optional(),
  })
  .optional();

export async function deleteHoliday(id: string, rawOptions?: z.input<typeof mutationOptionsSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const options = mutationOptionsSchema.parse(rawOptions);
  const shouldRecalculatePaidThroughDates = options?.recalculatePaidThroughDates !== false;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.holiday.findUnique({ where: { id } });
    if (!existing) {
      throw new Error("Holiday not found.");
    }

    await tx.holiday.delete({ where: { id } });

    if (shouldRecalculatePaidThroughDates) {
      await recomputeHolidayEnrolments(
        [
          {
            startDate: existing.startDate,
            endDate: existing.endDate,
            levelId: existing.levelId,
            templateId: existing.templateId,
          },
        ],
        "HOLIDAY_REMOVED",
        { tx }
      );
    }
  });

  revalidatePath("/admin/holidays");
  revalidatePath("/admin/settings/holidays");
  revalidatePath("/admin/schedule");
}
