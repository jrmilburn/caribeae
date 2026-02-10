"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteStudent(id : string) {

    const user = await getOrCreateUser()
    await requireAdmin()

    const deletedStudent = await prisma.student.delete({
        where: {
            id: id
        },
    })

    if(!deletedStudent) {
        return { success: false }
    }

    return { success: true }

}
