"use server";

import { revalidatePath } from "next/cache";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { prisma } from "@/lib/prisma";

import { autoAssignWeeklyEnrolmentsToTemplate } from "./autoAssignWeeklyEnrolments";
import { ClientTemplate } from "./types";

export async function createTemplate(payload: ClientTemplate) {
  await getOrCreateUser();

  const newTemplate = await prisma.$transaction(async (tx) => {
    const template = await tx.classTemplate.create({
      data: {
        name: payload?.name,
        levelId: payload?.levelId,
        dayOfWeek: payload?.dayOfWeek,
        startTime: payload?.startTime,
        endTime: payload?.endTime,
        startDate: new Date(payload.startDate),
        endDate: payload?.endDate ? new Date(payload.endDate) : null,
        capacity: payload?.capacity,
        active: payload?.active,
        teacherId: payload?.teacherId ?? null,
      },
    });

    await autoAssignWeeklyEnrolmentsToTemplate({
      tx,
      templateId: template.id,
      levelId: template.levelId,
    });

    return template;
  });

  if (!newTemplate) {
    return { success: false };
  }

  revalidatePath("/admin/schedule");

  return { success: true };
}
