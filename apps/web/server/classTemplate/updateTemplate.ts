"use server"

import { prisma } from "@/lib/prisma";
import { ClientTemplate } from "./types";
import { parseClassTemplatePayload } from "./validators";
import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { revalidatePath } from "next/cache";

export async function updateTemplate(payload : ClientTemplate, id : string) {

        await getOrCreateUser();
        await requireAdmin();

        const templateId = z.string().min(1).parse(id);
        const parsed = parseClassTemplatePayload(payload);
    
        const updatedTemplate = await prisma.classTemplate.update({
            where: {
                id: templateId
            },
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
                teacherId: parsed.teacherId
            }
        })
    
        if(!updatedTemplate) {
            return { success: false }
        }

        revalidatePath("/admin/schedule")
    
        return { success: true }

}
