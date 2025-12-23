"use server"

import { prisma } from "@/lib/prisma";

export async function deletedClassInstance(id : string) {

    const deletedClassInstance = await prisma.classInstance.delete({
        where: {
            id
        },
    })

    if(!deletedClassInstance) {
        return { success: false }
    }

    return { success: true }

}