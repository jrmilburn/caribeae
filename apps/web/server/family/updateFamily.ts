"use server"

import { prisma } from "@/lib/prisma";

import type { ClientFamily } from "./types";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export async function updateFamily(payload : ClientFamily, id : string) {

    const user = await getOrCreateUser()

    const newFamily = await prisma.family.update({
        where: {
            id: id
        },
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