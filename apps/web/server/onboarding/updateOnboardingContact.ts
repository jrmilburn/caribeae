"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { isValidE164, normalizeEmail, normalizePhone } from "@/lib/auth/identity";
import {
  createOnboardingUpdateToken,
  verifyOnboardingUpdateToken,
} from "@/server/onboarding/updateToken";

const schema = z.object({
  requestId: z.string().min(1),
  familyId: z.string().min(1),
  identifier: z.string().min(1),
  type: z.enum(["email", "phone"]),
  updateToken: z.string().min(1),
});

type Result =
  | { ok: true; normalized: string; updateToken: string }
  | { ok: false; error: string };

export async function updateOnboardingContact(input: z.infer<typeof schema>): Promise<Result> {
  const payload = schema.parse(input);

  const normalized =
    payload.type === "email" ? normalizeEmail(payload.identifier) : normalizePhone(payload.identifier);

  if (!normalized) {
    return { ok: false, error: "Enter a valid email or mobile number." };
  }

  if (payload.type === "phone" && !isValidE164(normalized)) {
    return { ok: false, error: "Enter a valid mobile number." };
  }

  const request = await prisma.onboardingRequest.findUnique({
    where: { id: payload.requestId },
    select: { id: true, familyId: true, updateTokenHash: true, updateTokenExpiresAt: true },
  });

  if (
    !request ||
    request.familyId !== payload.familyId ||
    !verifyOnboardingUpdateToken({
      token: payload.updateToken,
      hash: request.updateTokenHash ?? undefined,
      expiresAt: request.updateTokenExpiresAt ?? undefined,
    })
  ) {
    return { ok: false, error: "Unable to update contact details." };
  }

  const updateFamily: Record<string, string> = {};
  const updateRequest: Record<string, string> = {};

  if (payload.type === "email") {
    updateFamily.primaryEmail = normalized;
    updateRequest.email = normalized;
  } else {
    updateFamily.primaryPhone = normalized;
    updateRequest.phone = normalized;
  }

  const rotated = createOnboardingUpdateToken();

  await prisma.$transaction([
    prisma.family.update({
      where: { id: payload.familyId },
      data: updateFamily,
    }),
    prisma.onboardingRequest.update({
      where: { id: payload.requestId },
      data: {
        ...updateRequest,
        updateTokenHash: rotated.hash,
        updateTokenExpiresAt: rotated.expiresAt,
      },
    }),
  ]);

  return { ok: true, normalized, updateToken: rotated.token };
}
