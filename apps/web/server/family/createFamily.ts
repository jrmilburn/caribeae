"use server"

import { prisma } from "@/lib/prisma";

import type { ClientFamilyWithStudents, FamilyActionResult } from "./types";
import { parseFamilyPayload, parseFamilyStudents } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function createFamily(payload: ClientFamilyWithStudents): Promise<FamilyActionResult> {
    await getOrCreateUser();

    const parsed = parseFamilyPayload(payload);
    if (!parsed.success) {
        return { success: false, error: parsed.error };
    }

    const parsedStudents = parseFamilyStudents(payload.students);
    if (!parsedStudents.success) {
        return { success: false, error: parsedStudents.error };
    }

    try {
        const newFamily = await prisma.$transaction(async (tx) => {
            const family = await tx.family.create({
                data: parsed.data,
            });

            if (parsedStudents.data.length > 0) {
                await tx.student.createMany({
                    data: parsedStudents.data.map((student) => ({
                        ...student,
                        familyId: family.id,
                    })),
                });
            }

            return family;
        });

        if (!newFamily) {
            return { success: false, error: "Unable to create family." };
        }

        return { success: true, family: newFamily };
    } catch {
        return { success: false, error: "Unable to create family." };
    }
}
