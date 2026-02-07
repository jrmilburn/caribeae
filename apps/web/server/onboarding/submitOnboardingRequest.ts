"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { isValidE164, normalizeEmail, normalizePhone } from "@/lib/auth/identity";
import { publicOnboardingRequestSchema } from "@/lib/onboarding/schema";
import { findEligibleFamilyForIdentifiers } from "@/server/auth/eligibility";
import { resolveFamilyName } from "@/server/onboarding/resolveFamilyName";

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
  familyId: z.string().optional(),
  error: z.string().optional(),
});

export type SubmitOnboardingResult = z.infer<typeof submitResultSchema>;

const submitSchema = publicOnboardingRequestSchema.extend({
  requestId: z.string().trim().optional().nullable(),
  familyId: z.string().trim().optional().nullable(),
});

export async function submitOnboardingRequest(
  input: z.input<typeof submitSchema>
): Promise<SubmitOnboardingResult> {
  const payload = submitSchema.parse(input);

  if (payload.honeypot && payload.honeypot.trim().length > 0) {
    return { ok: false, error: "Unable to submit the request." };
  }

  const ip = await getClientIp();
  const rateLimit = checkRateLimit(`onboarding:${ip}`);
  if (!rateLimit.ok) {
    return { ok: false, error: "Too many requests. Please try again shortly." };
  }

  const normalizedEmailRaw = payload.contact.email ? normalizeEmail(payload.contact.email) : "";
  const normalizedEmail = normalizedEmailRaw ? normalizedEmailRaw : null;
  const normalizedPhoneRaw = payload.contact.phone ? normalizePhone(payload.contact.phone) : "";
  const normalizedPhone = normalizedPhoneRaw && isValidE164(normalizedPhoneRaw) ? normalizedPhoneRaw : null;

  const normalizedSecondaryEmailRaw = payload.contact.secondaryEmail
    ? normalizeEmail(payload.contact.secondaryEmail)
    : "";
  const normalizedSecondaryEmail = normalizedSecondaryEmailRaw ? normalizedSecondaryEmailRaw : null;
  const normalizedSecondaryPhoneRaw = payload.contact.secondaryPhone
    ? normalizePhone(payload.contact.secondaryPhone)
    : "";
  const normalizedSecondaryPhone =
    normalizedSecondaryPhoneRaw && isValidE164(normalizedSecondaryPhoneRaw) ? normalizedSecondaryPhoneRaw : null;

  const emergencyContactName = payload.contact.emergencyContactName?.trim() || null;
  const emergencyContactPhone = payload.contact.emergencyContactPhone?.trim() || null;
  const address = payload.contact.address?.trim() || null;
  const secondaryContactName = payload.contact.secondaryContactName?.trim() || null;

  if (payload.requestId && payload.familyId) {
    try {
      await prisma.$transaction([
        prisma.family.update({
          where: { id: payload.familyId },
          data: {
            primaryContactName: payload.contact.guardianName,
            primaryEmail: normalizedEmail,
            primaryPhone: normalizedPhone,
            secondaryContactName,
            secondaryEmail: normalizedSecondaryEmail,
            secondaryPhone: normalizedSecondaryPhone,
            medicalContactName: emergencyContactName,
            medicalContactPhone: emergencyContactPhone,
            address,
          },
        }),
        prisma.onboardingRequest.update({
          where: { id: payload.requestId },
          data: {
            guardianName: payload.contact.guardianName,
            phone: normalizedPhone ?? (payload.contact.phone?.trim() || null),
            email: normalizedEmail,
            secondaryContactName,
            secondaryEmail: normalizedSecondaryEmail,
            secondaryPhone: normalizedSecondaryPhone,
            emergencyContactName,
            emergencyContactPhone,
            address,
            studentsJson: payload.students,
            availabilityJson: payload.availability,
          },
        }),
      ]);
      return { ok: true, id: payload.requestId, familyId: payload.familyId };
    } catch (error) {
      return { ok: false, error: "Unable to update the request." };
    }
  }

  const existingFamily = await findEligibleFamilyForIdentifiers(
    [
      ...(normalizedEmail ? [normalizedEmail] : []),
      ...(normalizedSecondaryEmail ? [normalizedSecondaryEmail] : []),
    ],
    [
      ...(normalizedPhone ? [normalizedPhone] : []),
      ...(normalizedSecondaryPhone ? [normalizedSecondaryPhone] : []),
    ]
  );

  const created = await prisma.$transaction(async (tx) => {
    let familyId = existingFamily?.id ?? null;

    if (!familyId) {
      const family = await tx.family.create({
        data: {
          name: resolveFamilyName(payload.contact.guardianName),
          primaryContactName: payload.contact.guardianName,
          primaryEmail: normalizedEmail,
          primaryPhone: normalizedPhone,
          secondaryContactName,
          secondaryEmail: normalizedSecondaryEmail,
          secondaryPhone: normalizedSecondaryPhone,
          medicalContactName: emergencyContactName,
          medicalContactPhone: emergencyContactPhone,
          address,
        },
        select: { id: true },
      });
      familyId = family.id;
    }

    const onboarding = await tx.onboardingRequest.create({
      data: {
        guardianName: payload.contact.guardianName,
        phone: normalizedPhone ?? payload.contact.phone?.trim() || null,
        email: normalizedEmail,
        secondaryContactName,
        secondaryEmail: normalizedSecondaryEmail,
        secondaryPhone: normalizedSecondaryPhone,
        emergencyContactName,
        emergencyContactPhone,
        address,
        studentsJson: payload.students,
        availabilityJson: payload.availability,
        status: "NEW",
        familyId,
      },
      select: { id: true, familyId: true },
    });

    return onboarding;
  });

  return { ok: true, id: created.id, familyId: created.familyId ?? undefined };
}
