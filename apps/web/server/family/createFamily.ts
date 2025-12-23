"use server"

import { prisma } from "@/lib/prisma";

import type { ClientFamily } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function createFamily(payload : ClientFamily) {

    await getOrCreateUser()

    const newFamily = await prisma.family.create({
        data: {
            name: payload?.name,
            primaryContactName: payload?.primaryContactName,
            primaryEmail: payload?.primaryEmail,
            primaryPhone: payload?.primaryPhone,
            secondaryContactName: payload?.secondaryContactName,
            secondaryEmail: payload?.secondaryEmail,
            secondaryPhone: payload?.secondaryPhone,
            medicalContactName: payload?.medicalContactName,
            medicalContactPhone: payload?.medicalContactPhone
        }
    })

    if(!newFamily) {
        return { success: false }
    }

    return { success: true }

}