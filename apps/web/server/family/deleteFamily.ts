"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { z } from "zod";

export async function deleteFamily(id : string) {

    const user = await getOrCreateUser()
    await requireAdmin();

    const familyId = z.string().min(1).parse(id);

    const deletedFamily = await prisma.family.delete({
        where: {
            id: familyId
        },
    })

    if(!deletedFamily) {
        return { success: false }
    }

    return { success: true }

}
