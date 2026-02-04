"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const schema = z.object({
  id: z.string().min(1),
  status: z.enum(["NEW", "ACCEPTED", "DECLINED"]),
});

export async function updateOnboardingStatus(input: z.infer<typeof schema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);

  const request = await prisma.onboardingRequest.update({
    where: { id: payload.id },
    data: {
      status: payload.status,
      reviewedById: user.id,
      reviewedAt: new Date(),
    },
  });

  return { ok: true, requestId: request.id } as const;
}
