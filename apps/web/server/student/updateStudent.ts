"use server"

import { prisma } from "@/lib/prisma";

import type { ClientStudent } from "./types";
import { parseStudentPayload } from "./validators";
import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

type UpdateStudentPayload = ClientStudent & { id: string };

export async function updateStudent(payload: UpdateStudentPayload) {

    await getOrCreateUser()
    await requireAdmin()

    const studentId = z.string().min(1).parse(payload.id);
    const parsed = parseStudentPayload(payload);

    const updatedStudent = await prisma.student.update({
        where: {
            id: studentId
        },
        data: {
            name: parsed.name,
            dateOfBirth: parsed.dateOfBirth,
            medicalNotes: parsed.medicalNotes,
            familyId: parsed.familyId,
            levelId: parsed.levelId
        }
    })

    if(!updatedStudent) {
        return { success: false }
    }

    return { success: true }

}
