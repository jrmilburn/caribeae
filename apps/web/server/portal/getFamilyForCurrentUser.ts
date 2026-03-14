import "server-only";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { findEligibleFamilyForUser } from "@/server/auth/resolveFamily";
import { findPendingOnboardingRequestForUser } from "@/server/onboarding/pendingAccess";

export type FamilyAccessResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_MATCH" }
  | {
      status: "PENDING_APPROVAL";
      onboarding: { guardianName: string; familyName: string; submittedAt: Date };
    }
  | { status: "OK"; family: { id: string; name: string } };

export async function getFamilyForCurrentUser(): Promise<FamilyAccessResult> {
  const { userId, sessionId } = await auth();
  if (!userId) return { status: "SIGNED_OUT" };

  const { sessions } = await clerkClient();
  const mappedUser = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  });

  if (mappedUser?.familyId) {
    const family = await prisma.family.findUnique({
      where: { id: mappedUser.familyId },
      select: { id: true, name: true },
    });
    if (family) return { status: "OK", family };
  }

  const clerkUser = await currentUser();
  const family = await findEligibleFamilyForUser(clerkUser);

  if (family) {
    try {
      await prisma.user.upsert({
        where: { clerkId: userId },
        create: { clerkId: userId, familyId: family.id },
        update: { familyId: family.id },
      });
    } catch {
      if (sessionId) {
        await sessions.revokeSession(sessionId).catch(() => null);
      }
      return { status: "NO_MATCH" };
    }

    return { status: "OK", family };
  }

  const pendingRequest = await findPendingOnboardingRequestForUser(clerkUser);
  if (pendingRequest) {
    return {
      status: "PENDING_APPROVAL",
      onboarding: {
        guardianName: pendingRequest.guardianName,
        familyName: pendingRequest.familyName,
        submittedAt: pendingRequest.createdAt,
      },
    };
  }

  if (sessionId) {
    await sessions.revokeSession(sessionId).catch(() => null);
  }
  return { status: "NO_MATCH" };
}
