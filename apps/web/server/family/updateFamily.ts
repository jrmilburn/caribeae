"use server"

import { prisma } from "@/lib/prisma";

import type { ClientFamily, FamilyActionResult } from "./types";
import { parseFamilyPayload } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function updateFamily(payload: ClientFamily, id: string): Promise<FamilyActionResult> {
    await getOrCreateUser();

    const parsed = parseFamilyPayload(payload);
    if (!parsed.success) {
        return { success: false, error: parsed.error };
    }

    const newFamily = await prisma.family.update({
        where: {
            id: id,
        },
        data: parsed.data,
    });

    if (!newFamily) {
        return { success: false, error: "Unable to update family." };
    }

    return { success: true, family: newFamily };
}
