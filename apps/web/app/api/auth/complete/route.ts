import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { consumePendingAuth } from "@/server/auth/pendingAuth";
import { findEligibleFamilyForUser } from "@/server/auth/resolveFamily";

export const runtime = "nodejs";

const GENERIC_ERROR = "Unable to finish signing you in.";

function clearPendingCookie(response: NextResponse) {
  response.cookies.set("caribeae_auth", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

export async function POST() {
  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const token = cookies().get("caribeae_auth")?.value;
  const pending = token ? consumePendingAuth(token) : null;

  const familyId = pending?.familyId ?? null;
  let resolvedFamilyId = familyId;

  if (!resolvedFamilyId) {
    const clerkUser = await currentUser();
    const family = await findEligibleFamilyForUser(clerkUser);
    resolvedFamilyId = family?.id ?? null;
  }

  if (!resolvedFamilyId) {
    if (sessionId) {
      await clerkClient.sessions.revokeSession(sessionId).catch(() => null);
    }
    const response = NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 403 });
    clearPendingCookie(response);
    return response;
  }

  try {
    await prisma.user.upsert({
      where: { clerkId: userId },
      create: { clerkId: userId, familyId: resolvedFamilyId },
      update: { familyId: resolvedFamilyId },
    });
  } catch (error) {
    if (sessionId) {
      await clerkClient.sessions.revokeSession(sessionId).catch(() => null);
    }
    const response = NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 500 });
    clearPendingCookie(response);
    return response;
  }

  const response = NextResponse.json({ ok: true });
  clearPendingCookie(response);

  return response;
}
