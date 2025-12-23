"use server"

import { prisma } from "@/lib/prisma"

import { getOrCreateUser } from "@/lib/getOrCreateUser"

export async function getFamilies() {

    const user = await getOrCreateUser()

    const families = await prisma.family.findMany({
        orderBy: {
            createdAt: "desc"
        }
    })

    return families

}