"use server"

import { prisma } from "@/lib/prisma";

import type { ClientStudent } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function createStudent(payload : ClientStudent) {

    await getOrCreateUser()
    await requireAdmin()

    const dob = new Date(`${payload.dateOfBirth}T00:00:00.000Z`);   

    const newStudent = await prisma.student.create({
        data: {
            name: payload?.name,
            dateOfBirth: dob,
            medicalNotes: payload?.medicalNotes,
            familyId: payload.familyId,
            levelId: payload.levelId
        }
    })

    if(!newStudent) {
        return { success: false }
    }

    return { success: true }

}
