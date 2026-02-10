"use server";

import { revalidatePath } from "next/cache";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";

import { autoAssignWeeklyEnrolmentsToTemplate } from "./autoAssignWeeklyEnrolments";
import { ClientTemplate } from "./types";
import { parseClassTemplatePayload } from "./validators";

export async function createTemplate(payload: ClientTemplate) {
  await getOrCreateUser();
  await requireAdmin();

  const parsed = parseClassTemplatePayload(payload);

  const newTemplate = await prisma.$transaction(async (tx) => {
    const template = await tx.classTemplate.create({
      data: {
        name: parsed.name,
        levelId: parsed.levelId,
        dayOfWeek: parsed.dayOfWeek,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        capacity: parsed.capacity,
        active: parsed.active,
        teacherId: parsed.teacherId,
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
