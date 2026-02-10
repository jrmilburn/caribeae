"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { z } from "zod";

export async function deleteTemplate(id : string) {

    await getOrCreateUser();
    await requireAdmin();

    const templateId = z.string().min(1).parse(id);

    const deletedAssignments = await prisma.enrolmentClassAssignment.deleteMany({
        where: {
            templateId: templateId
        }
    })

    const deletedEnrolments = await prisma.enrolment.deleteMany({
        where: {
            templateId: templateId
        }
    })

    const deletedTemplate = await prisma.classTemplate.delete({
        where: {
            id: templateId
        },
    })

    if(!deletedTemplate || !deletedEnrolments || !deletedAssignments) {
        return { success: false }
    }

    return { success: true }

}
