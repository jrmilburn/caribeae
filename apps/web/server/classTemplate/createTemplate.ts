"use server"

import { prisma } from "@/lib/prisma";
import { ClientTemplate } from "./types";
import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function createTemplate(payload : ClientTemplate) {

    await getOrCreateUser();

    const newTemplate = await prisma.classTemplate.create({
        data: {
            name: payload?.name,
            levelId: payload?.levelId,
            dayOfWeek: payload?.dayOfWeek,
            startTime: payload?.startTime,
            endTime: payload?.endTime,
            capacity: payload?.capacity,
            active: payload?.active
        }
    })

    if(!newTemplate) {
        return { success: false }
    }

    return { success: true }

}