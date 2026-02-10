"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteFamily(id : string) {

    const user = await getOrCreateUser()
    await requireAdmin();

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
