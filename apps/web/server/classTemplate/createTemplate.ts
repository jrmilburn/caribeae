"use server"

import { prisma } from "@/lib/prisma";
import { ClientTemplate } from "./types";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { revalidatePath } from "next/cache";

export async function createTemplate(payload : ClientTemplate) {

    await getOrCreateUser();

    const newTemplate = await prisma.classTemplate.create({
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
            teacherId: payload?.teacherId ?? null
        }
    })

    if(!newTemplate) {
        return { success: false }
    }

    revalidatePath("/admin/schedule")

    return { success: true }

}
