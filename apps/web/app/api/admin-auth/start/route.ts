import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/server/auth/rateLimit";
import { getClientIp } from "@/server/auth/getClientIp";
import { isValidE164, normalizeIdentifier, type IdentifierType } from "@/lib/auth/identity";

export const runtime = "nodejs";

const NOT_ELIGIBLE_MESSAGE = "No admin account found. Please contact Caribeae.";

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
  const rateLimit = await checkRateLimit(`admin-auth:start:${ip}`);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429 }
    );
  }

  const normalized = normalizeIdentifier(payload.identifier, payload.type);
  if (payload.type === "phone" && !isValidE164(normalized)) {
    return NextResponse.json({ ok: false, error: "Invalid phone format." }, { status: 400 });
  }

  const { users } = await clerkClient();
  const userList = await users.getUserList({
    limit: 1,
    emailAddress: payload.type === "email" ? [normalized] : undefined,
    phoneNumber: payload.type === "phone" ? [normalized] : undefined,
  });

  const clerkUser = userList.data[0];
  if (!clerkUser) {
    return NextResponse.json({ ok: false, error: NOT_ELIGIBLE_MESSAGE }, { status: 403 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
    select: { admin: true },
  });

  if (!adminUser?.admin) {
    return NextResponse.json({ ok: false, error: NOT_ELIGIBLE_MESSAGE }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
