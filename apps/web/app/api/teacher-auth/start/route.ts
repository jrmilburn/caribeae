import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { normalizeIdentifier, type IdentifierType } from "@/lib/auth/identity";
import { getClientIp } from "@/server/auth/getClientIp";
import { checkRateLimit } from "@/server/auth/rateLimit";
import { TEACHER_NOT_ENABLED_MESSAGE } from "@/server/teacher/constants";
import { findEligibleTeacher } from "@/server/teacher/eligibility";
import { createPendingTeacherAuth } from "@/server/teacher/pendingTeacherAuth";

export const runtime = "nodejs";

function parsePayload(payload: unknown): { identifier: string; type: IdentifierType } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const identifier = typeof record.identifier === "string" ? record.identifier : "";
  const type = record.type === "email" || record.type === "phone" ? record.type : null;
  if (!identifier || !type) return null;
  return { identifier, type };
}

export async function POST(req: Request) {
  const payload = parsePayload(await req.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const ip = await getClientIp();
  const rateLimit = await checkRateLimit(`teacher-auth:start:${ip}`);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429 }
    );
  }

  const normalized = normalizeIdentifier(payload.identifier, payload.type);
  const teacher = await findEligibleTeacher({ identifier: normalized, type: payload.type });

  if (!teacher) {
    return NextResponse.json({ ok: false, error: TEACHER_NOT_ENABLED_MESSAGE }, { status: 403 });
  }

  const { users } = await clerkClient();
  const userList = await users.getUserList({
    limit: 1,
    emailAddress: payload.type === "email" ? [normalized] : undefined,
    phoneNumber: payload.type === "phone" ? [normalized] : undefined,
  });

  const flow = userList.data.length > 0 ? "signIn" : "signUp";

  const token = await createPendingTeacherAuth({
    teacherId: teacher.id,
    identifier: normalized,
    type: payload.type,
    flow,
  });

  const response = NextResponse.json({ ok: true, next: "verify", flow });
  response.cookies.set("caribeae_teacher_auth", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60,
    path: "/",
  });

  return response;
}
