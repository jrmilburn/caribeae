"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { publicOnboardingRequestSchema } from "@/lib/onboarding/schema";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

type RateLimitEntry = { count: number; resetAt: number };

type RateLimitStore = Map<string, RateLimitEntry>;

const rateLimitStore: RateLimitStore =
  (globalThis as typeof globalThis & { __onboardingRateLimit?: RateLimitStore }).__onboardingRateLimit ??
  new Map();

if (!(globalThis as typeof globalThis & { __onboardingRateLimit?: RateLimitStore }).__onboardingRateLimit) {
  (globalThis as typeof globalThis & { __onboardingRateLimit?: RateLimitStore }).__onboardingRateLimit =
    rateLimitStore;
}

async function getClientIp() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return headerList.get("x-real-ip") ?? "unknown";
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || now > current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true } as const;
  }
  if (current.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterMs: current.resetAt - now } as const;
  }
  current.count += 1;
  rateLimitStore.set(key, current);
  return { ok: true } as const;
}

const submitResultSchema = z.object({
  ok: z.boolean(),
  id: z.string().optional(),
  error: z.string().optional(),
});

export type SubmitOnboardingResult = z.infer<typeof submitResultSchema>;

export async function submitOnboardingRequest(
  input: z.input<typeof publicOnboardingRequestSchema>
): Promise<SubmitOnboardingResult> {
  const payload = publicOnboardingRequestSchema.parse(input);

  if (payload.honeypot && payload.honeypot.trim().length > 0) {
    return { ok: false, error: "Unable to submit the request." };
  }

  const ip = await getClientIp();
  const rateLimit = checkRateLimit(`onboarding:${ip}`);
  if (!rateLimit.ok) {
    return { ok: false, error: "Too many requests. Please try again shortly." };
  }

  const created = await prisma.onboardingRequest.create({
    data: {
      guardianName: payload.contact.guardianName,
      phone: payload.contact.phone,
      email: payload.contact.email,
      emergencyContactName: payload.contact.emergencyContactName?.trim() || null,
      emergencyContactPhone: payload.contact.emergencyContactPhone?.trim() || null,
      address: payload.contact.address?.trim() || null,
      studentsJson: payload.students,
      availabilityJson: payload.availability,
      status: "NEW",
    },
  });

  return { ok: true, id: created.id };
}
