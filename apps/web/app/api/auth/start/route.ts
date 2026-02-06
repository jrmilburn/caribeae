import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

import { checkRateLimit } from "@/server/auth/rateLimit";
import { getClientIp } from "@/server/auth/getClientIp";
import { findEligibleFamily } from "@/server/auth/eligibility";
import { createPendingAuth } from "@/server/auth/pendingAuth";
import { normalizeIdentifier, type IdentifierType } from "@/lib/auth/identity";

export const runtime = "nodejs";

const NOT_ELIGIBLE_MESSAGE = "No family account found. Please contact Caribeae.";

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
  const rateLimit = checkRateLimit(`auth:start:${ip}`);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again shortly." },
      { status: 429 }
    );
  }

  const normalized = normalizeIdentifier(payload.identifier, payload.type);
  const family = await findEligibleFamily({ identifier: normalized, type: payload.type });

  if (!family) {
    return NextResponse.json({ ok: false, error: NOT_ELIGIBLE_MESSAGE }, { status: 403 });
  }

  const { users } = await clerkClient();
  const userList = await users.getUserList({
    limit: 1,
    emailAddress: payload.type === "email" ? [normalized] : undefined,
    phoneNumber: payload.type === "phone" ? [normalized] : undefined,
  });

  const flow = userList.data.length > 0 ? "signIn" : "signUp";

  const token = createPendingAuth({
    familyId: family.id,
    identifier: normalized,
    type: payload.type,
    flow,
  });

  const response = NextResponse.json({ ok: true, next: "verify", flow });
  response.cookies.set("caribeae_auth", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60,
    path: "/",
  });

  return response;
}
