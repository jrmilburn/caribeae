"use server"

import { prisma } from "@/lib/prisma";

import type { ClientStudent } from "./types";
import { parseStudentPayload } from "./validators";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function createStudent(payload : ClientStudent) {

    await getOrCreateUser()
    await requireAdmin()

    const parsed = parseStudentPayload(payload);

    const newStudent = await prisma.student.create({
        data: {
            name: parsed.name,
            dateOfBirth: parsed.dateOfBirth,
            medicalNotes: parsed.medicalNotes,
            familyId: parsed.familyId,
            levelId: parsed.levelId
        }
    })

    if(!newStudent) {
        return { success: false }
    }

    return { success: true }

}
