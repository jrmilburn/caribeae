"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function deleteFamily(id : string) {

    const user = await getOrCreateUser()

    const deletedFamily = await prisma.family.delete({
        where: {
            id: id
        },
    })

    if(!deletedFamily) {
        return { success: false }
    }

    return { success: true }

}