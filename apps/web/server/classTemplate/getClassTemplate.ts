"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getClassTemplate(id : string) {

    await getOrCreateUser();
    await requireAdmin();

    const template = await prisma.classTemplate.findUnique({
        where: {
            id
        },
        include : {
            enrolments: {
                include: {
                    student: true,
                    plan: true
                }
            },
            level: true,
            teacher: true
        }
    })

    if(!template) {
        return { success: false }
    }

    return template

}