"use server"

import { prisma } from "@/lib/prisma";

import type { ClientFamily, FamilyActionResult } from "./types";
import { parseFamilyPayload } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function createFamily(payload: ClientFamily): Promise<FamilyActionResult> {
    await getOrCreateUser();

    const parsed = parseFamilyPayload(payload);
    if (!parsed.success) {
        return { success: false, error: parsed.error };
    }

    const newFamily = await prisma.family.create({
        data: parsed.data,
    });

    if (!newFamily) {
        return { success: false, error: "Unable to create family." };
    }

    return { success: true, family: newFamily };
}
