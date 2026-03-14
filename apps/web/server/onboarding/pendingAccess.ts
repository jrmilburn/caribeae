import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone, type IdentifierType } from "@/lib/auth/identity";
import { resolveFamilyName } from "@/server/onboarding/resolveFamilyName";

type PendingOnboardingAccess = {
  id: string;
  guardianName: string;
  familyName: string;
  createdAt: Date;
};

type ClerkVerification = { status?: string | null } | null | undefined;
type ClerkEmail = { emailAddress: string; verification?: ClerkVerification };
type ClerkPhone = { phoneNumber: string; verification?: ClerkVerification };
type ClerkUserLike = {
  emailAddresses?: ClerkEmail[];
  phoneNumbers?: ClerkPhone[];
} | null;

function isVerified(verification: ClerkVerification) {
  return verification?.status === "verified";
}

function buildRequestFilters(identifier: string, type: IdentifierType) {
  if (type === "email") {
    const normalized = normalizeEmail(identifier);
    return {
      normalized,
      filters: [
        { email: { equals: normalized, mode: "insensitive" as const } },
        { secondaryEmail: { equals: normalized, mode: "insensitive" as const } },
      ],
    };
  }

  const normalized = normalizePhone(identifier);
  return {
    normalized,
    filters: [{ phone: { equals: normalized } }, { secondaryPhone: { equals: normalized } }],
  };
}

function toPendingOnboardingAccess(match: { id: string; guardianName: string; createdAt: Date }): PendingOnboardingAccess {
  return {
    id: match.id,
    guardianName: match.guardianName,
    familyName: resolveFamilyName(match.guardianName),
    createdAt: match.createdAt,
  };
}

export async function findPendingOnboardingRequest(input: {
  identifier: string;
  type: IdentifierType;
}): Promise<PendingOnboardingAccess | null> {
  const { normalized, filters } = buildRequestFilters(input.identifier, input.type);
  if (!normalized || !filters.length) return null;

  const requests = await prisma.onboardingRequest.findMany({
    where: {
      status: "NEW",
      OR: filters,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      guardianName: true,
      createdAt: true,
    },
    take: 2,
  });

  if (requests.length > 1) {
    console.warn(
      `Multiple onboarding requests matched ${input.type} identifier ${input.identifier}. Using most recently updated.`
    );
  }

  const match = requests[0];
  return match ? toPendingOnboardingAccess(match) : null;
}

export async function findPendingOnboardingRequestForIdentifiers(emails: string[], phones: string[]) {
  const emailFilters = emails.flatMap((email) => [
    { email: { equals: email, mode: "insensitive" as const } },
    { secondaryEmail: { equals: email, mode: "insensitive" as const } },
  ]);

  const phoneFilters = phones.flatMap((phone) => [
    { phone: { equals: phone } },
    { secondaryPhone: { equals: phone } },
  ]);

  const filters = [...emailFilters, ...phoneFilters];
  if (!filters.length) return null;

  const requests = await prisma.onboardingRequest.findMany({
    where: {
      status: "NEW",
      OR: filters,
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      guardianName: true,
      createdAt: true,
    },
    take: 2,
  });

  if (requests.length > 1) {
    console.warn("Multiple onboarding requests matched verified identifiers. Using most recently updated.");
  }

  const match = requests[0];
  return match ? toPendingOnboardingAccess(match) : null;
}

export async function findPendingOnboardingRequestForUser(user: ClerkUserLike) {
  const emails = Array.from(
    new Set(
      (user?.emailAddresses ?? [])
        .filter((entry) => isVerified(entry.verification))
        .map((entry) => normalizeEmail(entry.emailAddress))
        .filter(Boolean)
    )
  );

  const phones = Array.from(
    new Set(
      (user?.phoneNumbers ?? [])
        .filter((entry) => isVerified(entry.verification))
        .map((entry) => normalizePhone(entry.phoneNumber))
        .filter(Boolean)
    )
  );

  return findPendingOnboardingRequestForIdentifiers(emails, phones);
}
