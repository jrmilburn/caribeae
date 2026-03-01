import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone, type IdentifierType } from "@/lib/auth/identity";

export type TeacherMatch = { id: string; name: string };

type EligibilityInput = { identifier: string; type: IdentifierType };

type TeacherRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  updatedAt: Date;
};

async function listTeacherCandidates() {
  return prisma.teacher.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      updatedAt: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

function toMatch(row: TeacherRow | null): TeacherMatch | null {
  if (!row) return null;
  return { id: row.id, name: row.name };
}

function pickLatestMatch(matches: TeacherRow[], context: string) {
  if (matches.length > 1) {
    console.warn(`Multiple teachers matched ${context}. Using most recently updated.`);
  }
  return matches[0] ?? null;
}

export async function findEligibleTeacher({ identifier, type }: EligibilityInput) {
  if (type === "email") {
    const normalized = normalizeEmail(identifier);
    if (!normalized) return null;

    const teachers = await listTeacherCandidates();
    const matches = teachers.filter(
      (teacher) => teacher.email && normalizeEmail(teacher.email) === normalized
    );

    return toMatch(pickLatestMatch(matches, `${type} identifier ${identifier}`));
  }

  const normalized = normalizePhone(identifier);
  if (!normalized) return null;

  const teachers = await listTeacherCandidates();
  const matches = teachers.filter((teacher) => {
    if (!teacher.phone) return false;
    return normalizePhone(teacher.phone) === normalized;
  });

  return toMatch(pickLatestMatch(matches, `${type} identifier ${identifier}`));
}

export async function findEligibleTeacherForIdentifiers(emails: string[], phones: string[]) {
  const emailSet = new Set(emails.map((value) => normalizeEmail(value)).filter(Boolean));
  const phoneSet = new Set(phones.map((value) => normalizePhone(value)).filter(Boolean));

  if (!emailSet.size && !phoneSet.size) {
    return null;
  }

  const teachers = await listTeacherCandidates();
  const matches = teachers.filter((teacher) => {
    const email = teacher.email ? normalizeEmail(teacher.email) : "";
    const phone = teacher.phone ? normalizePhone(teacher.phone) : "";
    if (email && emailSet.has(email)) return true;
    if (phone && phoneSet.has(phone)) return true;
    return false;
  });

  return toMatch(pickLatestMatch(matches, "verified identifiers"));
}
