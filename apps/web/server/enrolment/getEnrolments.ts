"use server"

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getEnrolments() {

    await getOrCreateUser()
    await requireAdmin()

    const enrolments = await prisma.enrolment.findMany({
        orderBy: {
            createdAt: "asc"
        },
        where: {
            status: "ACTIVE"
        },
        include: {
            student: true
        }
    })

    return enrolments

}