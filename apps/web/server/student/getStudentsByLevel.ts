"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getStudentsByLevel(levelId : string) {

    await getOrCreateUser()
    await requireAdmin()

    const students = await prisma.student.findMany({
        orderBy: {
            createdAt: "asc"
        },
        where: {
            levelId
        }
    })

    return students

}