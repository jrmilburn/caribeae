"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import { getFamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";

export async function getReceptionFamilyData(familyId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const [family, billing, billingPosition] = await Promise.all([
    prisma.family.findUnique({
      where: { id: familyId },
      select: {
        id: true,
        name: true,
        primaryContactName: true,
        primaryEmail: true,
        primaryPhone: true,
        secondaryContactName: true,
        secondaryEmail: true,
        secondaryPhone: true,
        medicalContactName: true,
        medicalContactPhone: true,
        address: true,
        students: {
          select: {
            id: true,
            name: true,
            levelId: true,
            level: { select: { id: true, name: true } },
          },
          orderBy: { name: "asc" },
        },
      },
    }),
    getFamilyBillingData(familyId),
    getFamilyBillingPosition(familyId),
  ]);

  if (!family) {
    throw new Error("Family not found.");
  }

  return { family, billing, billingPosition };
}
