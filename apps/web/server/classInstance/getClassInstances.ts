import type { ClassInstance } from "@prisma/client"

import { prisma } from "@/lib/prisma"

export default async function getClassInstances() {

    const classInstances = await prisma.classInstance.findMany({
        orderBy: {
            
        }
    })

    return

}