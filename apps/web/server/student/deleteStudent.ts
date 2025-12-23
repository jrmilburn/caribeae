"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function deleteStudent(id : string) {

    const user = await getOrCreateUser()

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