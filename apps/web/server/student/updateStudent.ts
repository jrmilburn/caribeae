"use server"

import { prisma } from "@/lib/prisma";

import type { ClientStudent } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

type UpdateStudentPayload = ClientStudent & { id: string };

export async function updateStudent(payload: UpdateStudentPayload) {

    await getOrCreateUser()

    const dob = new Date(`${payload.dateOfBirth}T00:00:00.000Z`);

    const updatedStudent = await prisma.student.update({
        where: {
            id: payload.id
        },
        data: {
            name: payload?.name,
            dateOfBirth: dob,
            medicalNotes: payload?.medicalNotes,
            familyId: payload.familyId,
            levelId: payload.levelId
        }
    })

    if(!updatedStudent) {
        return { success: false }
    }

    return { success: true }

}
