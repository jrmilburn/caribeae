import type { Family } from "@prisma/client";

export type ClientFamily = {
    name: string,
    primaryContactName?: string,
    primaryEmail?: string,
    primaryPhone?: string,
    secondaryContactName?: string,
    secondaryEmail?: string,
    secondaryPhone?: string,
    medicalContactName?: string,
    medicalContactPhone?: string,
    address?: string,
}

type ParsedFamilyPayload = {
    name: string;
    primaryContactName: string | null;
    primaryEmail: string | null;
    primaryPhone: string | null;
    secondaryContactName: string | null;
    secondaryEmail: string | null;
    secondaryPhone: string | null;
    medicalContactName: string | null;
    medicalContactPhone: string | null;
    address: string | null;
}

type ParseResult =
    | { success: true; data: ParsedFamilyPayload }
    | { success: false; error: string };

const trimToNull = (value?: string | null) => {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
};

export function parseFamilyPayload(payload: ClientFamily): ParseResult {
    const name = payload.name?.trim();
    if (!name) {
        return { success: false, error: "Family name is required." };
    }

    return {
        success: true,
        data: {
            name,
            primaryContactName: trimToNull(payload.primaryContactName),
            primaryEmail: trimToNull(payload.primaryEmail),
            primaryPhone: trimToNull(payload.primaryPhone),
            secondaryContactName: trimToNull(payload.secondaryContactName),
            secondaryEmail: trimToNull(payload.secondaryEmail),
            secondaryPhone: trimToNull(payload.secondaryPhone),
            medicalContactName: trimToNull(payload.medicalContactName),
            medicalContactPhone: trimToNull(payload.medicalContactPhone),
            address: trimToNull(payload.address),
        },
    };
}

export type FamilyActionResult = {
    success: boolean;
    family?: Family | null;
    error?: string;
};
