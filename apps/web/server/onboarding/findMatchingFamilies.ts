"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export type OnboardingFamilyMatch = {
  id: string;
  name: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
};

export async function findMatchingFamilies(args: {
  email?: string | null;
  phone?: string | null;
}): Promise<OnboardingFamilyMatch[]> {
  await getOrCreateUser();
  await requireAdmin();

  const email = args.email?.trim();
  const phone = args.phone?.trim();

  if (!email && !phone) return [];

  const families = await prisma.family.findMany({
    where: {
      OR: [
        email
          ? {
              OR: [
                { primaryEmail: { contains: email, mode: "insensitive" } },
                { secondaryEmail: { contains: email, mode: "insensitive" } },
              ],
            }
          : undefined,
        phone
          ? {
              OR: [
                { primaryPhone: { contains: phone, mode: "insensitive" } },
                { secondaryPhone: { contains: phone, mode: "insensitive" } },
              ],
            }
          : undefined,
      ].filter(Boolean) as Array<Record<string, unknown>>,
    },
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, primaryEmail: true, primaryPhone: true },
  });

  return families.map((family) => ({
    id: family.id,
    name: family.name,
    primaryEmail: family.primaryEmail,
    primaryPhone: family.primaryPhone,
  }));
}
