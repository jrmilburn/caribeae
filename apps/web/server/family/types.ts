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

export type FamilyStudentPayload = {
    name: string;
    dateOfBirth?: string | null;
    levelId: string;
    medicalNotes?: string | null;
};

export type ClientFamilyWithStudents = ClientFamily & { students?: FamilyStudentPayload[] };

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

type ParsedFamilyStudent = {
    name: string;
    dateOfBirth: Date | null;
    levelId: string;
    medicalNotes: string | null;
};

type ParseStudentsResult =
    | { success: true; data: ParsedFamilyStudent[] }
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

export function parseFamilyStudents(students?: FamilyStudentPayload[]): ParseStudentsResult {
    if (!students || students.length === 0) {
        return { success: true, data: [] };
    }

    const parsed: ParsedFamilyStudent[] = [];

    for (const student of students) {
        const name = student?.name?.trim() ?? "";
        if (!name) {
            return { success: false, error: "Student name is required." };
        }

        const levelId = student?.levelId?.trim() ?? "";
        if (!levelId) {
            return { success: false, error: "Student level is required." };
        }

        const dobStr = trimToNull(student?.dateOfBirth);
        let dob: Date | null = null;

        if (dobStr) {
            const parsedDob = new Date(`${dobStr}T00:00:00.000Z`);
            if (Number.isNaN(parsedDob.getTime())) {
                return { success: false, error: "Enter a valid date of birth for each student." };
            }
            dob = parsedDob;
        }

        parsed.push({
            name,
            levelId,
            dateOfBirth: dob,
            medicalNotes: trimToNull(student?.medicalNotes),
        });
    }

    return { success: true, data: parsed };
}
