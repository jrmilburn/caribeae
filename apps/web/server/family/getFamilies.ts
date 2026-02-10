"use server"

import { prisma } from "@/lib/prisma"

import { getOrCreateUser } from "@/lib/getOrCreateUser"
import { requireAdmin } from "@/lib/requireAdmin"

export async function getFamilies() {

    const user = await getOrCreateUser()
    await requireAdmin();

    const families = await prisma.family.findMany({
        orderBy: {
            createdAt: "desc"
        }
    })

    return families

}
