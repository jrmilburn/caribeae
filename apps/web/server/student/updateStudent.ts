"use server"

import { prisma } from "@/lib/prisma";

import type { ClientStudent } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function updateStudent(payload : ClientStudent, id : string) {

    const user = await getOrCreateUser()

    const dob = new Date(`${payload.dateOfBirth}T00:00:00.000Z`);

    const updatedStudent = await prisma.student.update({
        where: {
            id
        },
        data: {
            name: payload?.name,
            dateOfBirth: dob,
            medicalNotes: payload?.medicalNotes,
            familyId: payload.familyId
        }
    })

    if(!updatedStudent) {
        return { success: false }
    }

    return { success: true }

}