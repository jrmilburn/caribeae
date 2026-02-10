"use server"

import { prisma } from "@/lib/prisma";

import type { ClientFamily, FamilyActionResult } from "./types";
import { parseFamilyPayload } from "./types";
import { normalizeFamilyContactPhones } from "./normalizeFamilyContacts";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { z } from "zod";

export async function updateFamily(payload: ClientFamily, id: string): Promise<FamilyActionResult> {
    await getOrCreateUser();
    await requireAdmin();

    const familyId = z.string().min(1).parse(id);

    const parsed = parseFamilyPayload(payload);
    if (!parsed.success) {
        return { success: false, error: parsed.error };
    }

    const normalizedContacts = normalizeFamilyContactPhones({
        primaryPhone: parsed.data.primaryPhone,
        secondaryPhone: parsed.data.secondaryPhone,
    });
    if (!normalizedContacts.success) {
        return { success: false, error: normalizedContacts.error };
    }

    const newFamily = await prisma.family.update({
        where: {
            id: familyId,
        },
        data: {
            ...parsed.data,
            ...normalizedContacts.data,
        },
    });

    if (!newFamily) {
        return { success: false, error: "Unable to update family." };
    }

    return { success: true, family: newFamily };
}
