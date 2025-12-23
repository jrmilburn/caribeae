"use server"

import { prisma } from "@/lib/prisma";

import { ClientClassInstance } from "./types";

export async function createClassInstance(payload : ClientClassInstance) {

    const newClassInstance = await prisma.classInstance.create({
        data: {
            levelId: payload?.levelId,
            startTime: payload?.startTime,
            endTime: payload?.endTime,
            capacity: payload?.capacity
        }
    })

    if(!newClassInstance) {
        return { success: false }
    }

    return { success: true }

}