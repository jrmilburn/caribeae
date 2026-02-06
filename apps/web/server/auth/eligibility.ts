import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone, type IdentifierType } from "@/lib/auth/identity";

export type FamilyMatch = { id: string; name: string };

type EligibilityInput = { identifier: string; type: IdentifierType };

function buildFamilyFilters(identifier: string, type: IdentifierType) {
  if (type === "email") {
    const normalized = normalizeEmail(identifier);
    return {
      normalized,
      filters: [
        { primaryEmail: { equals: normalized, mode: "insensitive" as const } },
        { secondaryEmail: { equals: normalized, mode: "insensitive" as const } },
      ],
    };
  }

  const normalized = normalizePhone(identifier);
  return {
    normalized,
    filters: [
      { primaryPhone: { equals: normalized } },
      { secondaryPhone: { equals: normalized } },
    ],
  };
}

export async function findEligibleFamily({ identifier, type }: EligibilityInput) {
  const { normalized, filters } = buildFamilyFilters(identifier, type);
  if (!normalized || !filters.length) return null;

  const families = await prisma.family.findMany({
    where: {
      OR: filters,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      name: true,
      updatedAt: true,
    },
    take: 2,
  });

  if (families.length > 1) {
    console.warn(
      `Multiple families matched ${type} identifier ${identifier}. Using most recently updated.`
    );
  }

  const match = families[0];
  return match ? ({ id: match.id, name: match.name } as FamilyMatch) : null;
}

export async function findEligibleFamilyForIdentifiers(emails: string[], phones: string[]) {
  const emailFilters = emails.flatMap((email) => [
    { primaryEmail: { equals: email, mode: "insensitive" as const } },
    { secondaryEmail: { equals: email, mode: "insensitive" as const } },
  ]);

  const phoneFilters = phones.flatMap((phone) => [
    { primaryPhone: { equals: phone } },
    { secondaryPhone: { equals: phone } },
  ]);

  const filters = [...emailFilters, ...phoneFilters];
  if (!filters.length) return null;

  const families = await prisma.family.findMany({
    where: {
      OR: filters,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      name: true,
      updatedAt: true,
    },
    take: 2,
  });

  if (families.length > 1) {
    console.warn("Multiple families matched verified identifiers. Using most recently updated.");
  }

  const match = families[0];
  return match ? ({ id: match.id, name: match.name } as FamilyMatch) : null;
}
