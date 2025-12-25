"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteEnrolment(id : string) {

    await getOrCreateUser();
    await requireAdmin();

    const deletedEnrolment = await prisma.enrolment.delete({
        where: {
            id
        }
    })

    if(!deletedEnrolment) {
        return { success: false }
    }

    return { success: true } 

}