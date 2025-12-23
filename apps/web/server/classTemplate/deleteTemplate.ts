"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function deleteTemplate(id : string) {

    await getOrCreateUser();

    const deletedTemplate = await prisma.classTemplate.delete({
        where: {
            id
        },
    })

    if(!deletedTemplate) {
        return { success: false }
    }

    return { success: true }

}