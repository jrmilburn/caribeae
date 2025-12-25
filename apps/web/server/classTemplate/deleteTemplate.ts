"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function deleteTemplate(id : string) {

    await getOrCreateUser();

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

    if(!deletedTemplate || !deletedEnrolments) {
        return { success: false }
    }

    return { success: true }

}