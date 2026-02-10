"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteTemplate(id : string) {

    await getOrCreateUser();
    await requireAdmin();

    const deletedAssignments = await prisma.enrolmentClassAssignment.deleteMany({
        where: {
            templateId: id
        }
    })

    const deletedEnrolments = await prisma.enrolment.deleteMany({
        where: {
            templateId: id
        }
    })

    const deletedTemplate = await prisma.classTemplate.delete({
        where: {
            id
        },
    })

    if(!deletedTemplate || !deletedEnrolments || !deletedAssignments) {
        return { success: false }
    }

    return { success: true }

}
