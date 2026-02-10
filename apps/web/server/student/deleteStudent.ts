"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { z } from "zod";

export async function deleteStudent(id : string) {

    const user = await getOrCreateUser()
    await requireAdmin()

    const studentId = z.string().min(1).parse(id);

    const deletedStudent = await prisma.student.delete({
        where: {
            id: studentId
        },
    })

    if(!deletedStudent) {
        return { success: false }
    }

    return { success: true }

}
