"use server"

import { prisma } from "@/lib/prisma";
import { ClientTemplate } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function updateTemplate(payload : ClientTemplate, id : string) {

        await getOrCreateUser();
    
        const updatedTemplate = await prisma.classTemplate.update({
            where: {
                id
            },
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
    
        if(!updatedTemplate) {
            return { success: false }
        }
    
        return { success: true }

}
