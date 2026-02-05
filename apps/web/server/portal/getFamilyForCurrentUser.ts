import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

export type FamilyAccessResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_MATCH"; emails: string[] }
  | { status: "OK"; family: { id: string; name: string } };

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export async function getFamilyForCurrentUser(): Promise<FamilyAccessResult> {
  const { userId } = await auth();
  if (!userId) return { status: "SIGNED_OUT" };

  const user = await currentUser();
  const emails = Array.from(
    new Set(
      (user?.emailAddresses ?? [])
        .map((entry) => normalizeEmail(entry.emailAddress))
        .filter(Boolean)
    )
  );

  if (!emails.length) return { status: "NO_MATCH", emails: [] };

  const emailFilters = emails.flatMap((email) => [
    { primaryEmail: { equals: email, mode: "insensitive" as const } },
    { secondaryEmail: { equals: email, mode: "insensitive" as const } },
  ]);

  const family = await prisma.family.findFirst({
    where: {
      OR: emailFilters,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!family) return { status: "NO_MATCH", emails };

  return { status: "OK", family };
}
