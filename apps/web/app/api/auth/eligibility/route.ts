import { NextResponse } from "next/server";

import { checkRateLimit } from "@/server/auth/rateLimit";
import { getClientIp } from "@/server/auth/getClientIp";
import { findEligibleFamily } from "@/server/auth/eligibility";
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
  const rateLimit = await checkRateLimit(`auth:eligibility:${ip}`);
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

  return NextResponse.json({ ok: true });
}
