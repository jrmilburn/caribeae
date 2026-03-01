import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone } from "@/lib/auth/identity";
import { consumePendingTeacherAuth } from "@/server/teacher/pendingTeacherAuth";
import { findEligibleTeacherForUser } from "@/server/teacher/resolveTeacher";

export const runtime = "nodejs";

const GENERIC_ERROR = "Unable to finish signing you in.";

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

function clearPendingCookie(response: NextResponse) {
  response.cookies.set("caribeae_teacher_auth", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
}

function matchesPendingIdentifier(
  user: ClerkUserLike,
  pending: { identifier: string; type: "email" | "phone" }
) {
  if (!user) return false;

  if (pending.type === "email") {
    const target = normalizeEmail(pending.identifier);
    return (user.emailAddresses ?? []).some(
      (entry) => isVerified(entry.verification) && normalizeEmail(entry.emailAddress) === target
    );
  }

  const target = normalizePhone(pending.identifier);
  return (user.phoneNumbers ?? []).some(
    (entry) => isVerified(entry.verification) && normalizePhone(entry.phoneNumber) === target
  );
}

export async function POST() {
  const { userId, sessionId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { sessions } = await clerkClient();
  const cookieStore = await cookies();
  const token = cookieStore.get("caribeae_teacher_auth")?.value;
  const pending = token ? await consumePendingTeacherAuth(token) : null;

  let resolvedTeacherId = pending?.teacherId ?? null;

  const clerkUser = await currentUser();
  if (pending && !matchesPendingIdentifier(clerkUser, pending)) {
    if (sessionId) {
      await sessions.revokeSession(sessionId).catch(() => null);
    }
    const response = NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 403 });
    clearPendingCookie(response);
    return response;
  }

  if (!resolvedTeacherId) {
    const teacher = await findEligibleTeacherForUser(clerkUser);
    resolvedTeacherId = teacher?.id ?? null;
  }

  if (!resolvedTeacherId) {
    if (sessionId) {
      await sessions.revokeSession(sessionId).catch(() => null);
    }
    const response = NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 403 });
    clearPendingCookie(response);
    return response;
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: resolvedTeacherId },
    select: { id: true },
  });

  if (!teacher) {
    if (sessionId) {
      await sessions.revokeSession(sessionId).catch(() => null);
    }
    const response = NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 403 });
    clearPendingCookie(response);
    return response;
  }

  const response = NextResponse.json({ ok: true });
  clearPendingCookie(response);
  return response;
}
