import { prisma } from "@/lib/prisma"

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function getLevels() {

    const user = await getOrCreateUser()

    const levels = await prisma.level.findMany()

    return levels;

}