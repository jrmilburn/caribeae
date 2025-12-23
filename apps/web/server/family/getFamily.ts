"use server"

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export default async function getFamily(id : string){

    await getOrCreateUser()

    const family = await prisma.family.findUnique({
        where: {
            id: id
        },
        include: {
            students: true,
        }
    })

    return family

}