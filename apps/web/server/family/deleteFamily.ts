"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const deleteFamilyOptionsSchema = z
  .object({
    confirmed: z.boolean().optional(),
  })
  .optional();

const familyIdSchema = z.string().trim().min(1);

export type FamilyDeleteLinkedCounts = {
  students: number;
  invoices: number;
  payments: number;
};

export type FamilyDeletePreviewResult =
  | {
      success: true;
      linkedCounts: FamilyDeleteLinkedCounts;
      hasLinkedData: boolean;
    }
  | {
      success: false;
      error: string;
    };

export type FamilyDeleteResult =
  | { success: true }
  | {
      success: false;
      error: string;
      requiresConfirmation?: boolean;
      linkedCounts?: FamilyDeleteLinkedCounts;
    };

async function getLinkedCounts(familyId: string): Promise<FamilyDeleteLinkedCounts> {
  const [students, invoices, payments] = await Promise.all([
    prisma.student.count({ where: { familyId } }),
    prisma.invoice.count({ where: { familyId } }),
    prisma.payment.count({ where: { familyId } }),
  ]);

  return { students, invoices, payments };
}

export async function getFamilyDeletePreview(id: string): Promise<FamilyDeletePreviewResult> {
  await getOrCreateUser();
  await requireAdmin();

  const familyId = familyIdSchema.parse(id);

  try {
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true },
    });

    if (!family) {
      return { success: false, error: "Family not found." };
    }

    const linkedCounts = await getLinkedCounts(familyId);
    const hasLinkedData =
      linkedCounts.students > 0 || linkedCounts.invoices > 0 || linkedCounts.payments > 0;

    return {
      success: true,
      linkedCounts,
      hasLinkedData,
    };
  } catch {
    return { success: false, error: "Unable to inspect family dependencies." };
  }
}

export async function deleteFamily(
  id: string,
  options?: { confirmed?: boolean }
): Promise<FamilyDeleteResult> {
  await getOrCreateUser();
  await requireAdmin();

  const familyId = familyIdSchema.parse(id);
  const parsedOptions = deleteFamilyOptionsSchema.parse(options);
  const confirmed = parsedOptions?.confirmed === true;

  try {
    const family = await prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true },
    });

    if (!family) {
      return { success: false, error: "Family not found." };
    }

    const linkedCounts = await getLinkedCounts(familyId);
    const hasLinkedData =
      linkedCounts.students > 0 || linkedCounts.invoices > 0 || linkedCounts.payments > 0;

    if (hasLinkedData && !confirmed) {
      return {
        success: false,
        error: "Family has linked records. Confirm deletion to continue.",
        requiresConfirmation: true,
        linkedCounts,
      };
    }

    await prisma.$transaction(async (tx) => {
      // Keep auth/user records valid when their linked family is removed.
      await tx.user.updateMany({
        where: { familyId },
        data: { familyId: null },
      });

      // Optional relations are detached so history can remain without blocking deletion.
      await tx.onboardingRequest.updateMany({
        where: { familyId },
        data: { familyId: null },
      });
      await tx.conversation.updateMany({
        where: { familyId },
        data: { familyId: null },
      });
      await tx.message.updateMany({
        where: { familyId },
        data: { familyId: null },
      });

      await tx.accountOpeningState.deleteMany({ where: { familyId } });

      // Remove billing records first so student-linked invoice line items are cleared.
      await tx.invoice.deleteMany({ where: { familyId } });
      await tx.payment.deleteMany({ where: { familyId } });

      await tx.waitlistRequest.deleteMany({ where: { familyId } });
      await tx.student.deleteMany({ where: { familyId } });
      await tx.family.delete({ where: { id: familyId } });
    });

    return { success: true };
  } catch {
    return { success: false, error: "Unable to delete family." };
  }
}
