import "server-only";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";

import { findEligibleTeacherForUser } from "@/server/teacher/resolveTeacher";

export type TeacherAccessResult =
  | { status: "SIGNED_OUT" }
  | { status: "NO_MATCH" }
  | { status: "OK"; teacher: { id: string; name: string } };

export async function getTeacherForCurrentUser(options?: { revokeSessionOnNoMatch?: boolean }): Promise<TeacherAccessResult> {
  const { userId, sessionId } = await auth();
  if (!userId) return { status: "SIGNED_OUT" };

  const clerkUser = await currentUser();
  const teacher = await findEligibleTeacherForUser(clerkUser);

  if (!teacher) {
    const shouldRevoke = options?.revokeSessionOnNoMatch ?? true;
    if (shouldRevoke && sessionId) {
      const { sessions } = await clerkClient();
      await sessions.revokeSession(sessionId).catch(() => null);
    }
    return { status: "NO_MATCH" };
  }

  return { status: "OK", teacher };
}
