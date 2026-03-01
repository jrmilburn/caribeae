import { NextResponse } from "next/server";

import { getTeacherForCurrentUser } from "@/server/teacher/getTeacherForCurrentUser";

export const runtime = "nodejs";

export async function GET() {
  const access = await getTeacherForCurrentUser({ revokeSessionOnNoMatch: false });

  if (access.status === "SIGNED_OUT") {
    return NextResponse.json({ signedIn: false, teacher: false });
  }

  if (access.status !== "OK") {
    return NextResponse.json({ signedIn: true, teacher: false });
  }

  return NextResponse.json({
    signedIn: true,
    teacher: true,
    teacherId: access.teacher.id,
  });
}
