"use server"

import { prisma } from "@/lib/prisma";

import { ClientClassInstance } from "./types";

export async function updateClassInstance(payload : ClientClassInstance, id : string) {

    const updatedClassInstance = await prisma.classInstance.update({
        where: {
            id
        },
        data: {
            levelId: payload?.levelId,
            startTime: payload?.startTime,
            endTime: payload?.endTime,
            capacity: payload?.capacity
        }
    })

    if(!updatedClassInstance) {
        return { success: false }
    }

    return { success: true }

}