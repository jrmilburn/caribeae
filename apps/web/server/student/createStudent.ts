"use server"

import { prisma } from "@/lib/prisma";

import type { ClientStudent } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function createStudent(payload : ClientStudent) {

    const user = await getOrCreateUser()

    const dob = new Date(`${payload.dateOfBirth}T00:00:00.000Z`);   

    const newStudent = await prisma.student.create({
        data: {
            name: payload?.name,
            dateOfBirth: dob,
            medicalNotes: payload?.medicalNotes,
            familyId: payload.familyId
        }
    })

    if(!newStudent) {
        return { success: false }
    }

    return { success: true }

}