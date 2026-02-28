"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  type EnrolmentDeleteLinkedCounts,
  hasLinkedEnrolmentDeleteDependencies,
} from "@/lib/enrolment/deleteEnrolmentModel";

const enrolmentIdSchema = z.string().trim().min(1);
const deleteEnrolmentOptionsSchema = z
  .object({
    confirmed: z.boolean().optional(),
  })
  .optional();

export type EnrolmentDeletePreviewResult =
  | {
      success: true;
      linkedCounts: EnrolmentDeleteLinkedCounts;
      hasLinkedData: boolean;
    }
  | {
      success: false;
      error: string;
    };

export type EnrolmentDeleteResult =
  | {
      success: true;
      deletedEnrolmentId: string;
      studentId: string;
      familyId: string | null;
      templateIds: string[];
      linkedCounts: EnrolmentDeleteLinkedCounts;
    }
  | {
      success: false;
      error: string;
      requiresConfirmation?: boolean;
      linkedCounts?: EnrolmentDeleteLinkedCounts;
    };

const ENROLMENT_DELETE_CONTEXT_SELECT = {
  id: true,
  studentId: true,
  templateId: true,
  student: {
    select: {
      familyId: true,
    },
  },
  classAssignments: {
    select: {
      templateId: true,
    },
  },
  invoices: {
    select: {
      id: true,
    },
  },
} satisfies Prisma.EnrolmentSelect;

type TxClient = Prisma.TransactionClient;
type EnrolmentDeleteContext = Prisma.EnrolmentGetPayload<{
  select: typeof ENROLMENT_DELETE_CONTEXT_SELECT;
}>;

async function getLinkedCounts(
  tx: TxClient,
  enrolmentId: string,
  invoiceIds: string[]
): Promise<EnrolmentDeleteLinkedCounts> {
  const lineItemFilters: Prisma.InvoiceLineItemWhereInput[] = [{ enrolmentId }];
  if (invoiceIds.length > 0) {
    lineItemFilters.push({ invoiceId: { in: invoiceIds } });
  }

  const [
    classAssignments,
    adjustments,
    creditEvents,
    awayPeriodImpacts,
    coverageAudits,
    invoiceLineItems,
    paymentAllocations,
  ] = await Promise.all([
    tx.enrolmentClassAssignment.count({ where: { enrolmentId } }),
    tx.enrolmentAdjustment.count({ where: { enrolmentId } }),
    tx.enrolmentCreditEvent.count({ where: { enrolmentId } }),
    tx.awayPeriodImpact.count({ where: { enrolmentId } }),
    tx.enrolmentCoverageAudit.count({ where: { enrolmentId } }),
    tx.invoiceLineItem.count({ where: { OR: lineItemFilters } }),
    invoiceIds.length
      ? tx.paymentAllocation.count({ where: { invoiceId: { in: invoiceIds } } })
      : Promise.resolve(0),
  ]);

  return {
    invoices: invoiceIds.length,
    invoiceLineItems,
    paymentAllocations,
    classAssignments,
    adjustments,
    creditEvents,
    awayPeriodImpacts,
    coverageAudits,
  };
}

async function loadDeleteContext(
  tx: TxClient,
  enrolmentId: string
): Promise<
  | {
      enrolment: EnrolmentDeleteContext;
      linkedCounts: EnrolmentDeleteLinkedCounts;
      templateIds: string[];
    }
  | null
> {
  const enrolment = await tx.enrolment.findUnique({
    where: { id: enrolmentId },
    select: ENROLMENT_DELETE_CONTEXT_SELECT,
  });

  if (!enrolment) {
    return null;
  }

  const templateIds = Array.from(
    new Set([enrolment.templateId, ...enrolment.classAssignments.map((assignment) => assignment.templateId)])
  );
  const invoiceIds = enrolment.invoices.map((invoice) => invoice.id);
  const linkedCounts = await getLinkedCounts(tx, enrolment.id, invoiceIds);

  return { enrolment, linkedCounts, templateIds };
}

export async function getEnrolmentDeletePreview(id: string): Promise<EnrolmentDeletePreviewResult> {
  await getOrCreateUser();
  await requireAdmin();

  const parsedEnrolmentId = enrolmentIdSchema.safeParse(id);
  if (!parsedEnrolmentId.success) {
    return { success: false, error: "Invalid enrolment ID." };
  }

  try {
    const context = await prisma.$transaction((tx) => loadDeleteContext(tx, parsedEnrolmentId.data));
    if (!context) {
      return { success: false, error: "Enrolment not found." };
    }

    return {
      success: true,
      linkedCounts: context.linkedCounts,
      hasLinkedData: hasLinkedEnrolmentDeleteDependencies(context.linkedCounts),
    };
  } catch (error) {
    console.error("getEnrolmentDeletePreview failed", error);
    return { success: false, error: "Unable to inspect enrolment dependencies." };
  }
}

export async function deleteEnrolment(
  id: string,
  options?: {
    confirmed?: boolean;
  }
): Promise<EnrolmentDeleteResult> {
  await getOrCreateUser();
  await requireAdmin();

  const parsedEnrolmentId = enrolmentIdSchema.safeParse(id);
  if (!parsedEnrolmentId.success) {
    return { success: false, error: "Invalid enrolment ID." };
  }

  const parsedOptions = deleteEnrolmentOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    return { success: false, error: "Invalid delete options." };
  }
  const confirmed = parsedOptions.data?.confirmed === true;

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      const context = await loadDeleteContext(tx, parsedEnrolmentId.data);
      if (!context) {
        return { kind: "NOT_FOUND" as const };
      }

      const hasLinkedData = hasLinkedEnrolmentDeleteDependencies(context.linkedCounts);
      if (hasLinkedData && !confirmed) {
        return {
          kind: "CONFIRMATION_REQUIRED" as const,
          linkedCounts: context.linkedCounts,
        };
      }

      await tx.enrolment.delete({
        where: { id: context.enrolment.id },
      });

      return {
        kind: "DELETED" as const,
        deletedEnrolmentId: context.enrolment.id,
        studentId: context.enrolment.studentId,
        familyId: context.enrolment.student.familyId ?? null,
        templateIds: context.templateIds,
        linkedCounts: context.linkedCounts,
      };
    });

    if (txResult.kind === "NOT_FOUND") {
      return { success: false, error: "Enrolment not found." };
    }

    if (txResult.kind === "CONFIRMATION_REQUIRED") {
      return {
        success: false,
        error: "Enrolment has linked records. Confirm deletion to continue.",
        requiresConfirmation: true,
        linkedCounts: txResult.linkedCounts,
      };
    }

    txResult.templateIds.forEach((templateId) => revalidatePath(`/admin/class/${templateId}`));
    revalidatePath(`/admin/student/${txResult.studentId}`);
    if (txResult.familyId) {
      revalidatePath(`/admin/family/${txResult.familyId}`);
    }
    revalidatePath("/admin/enrolment");

    return {
      success: true,
      deletedEnrolmentId: txResult.deletedEnrolmentId,
      studentId: txResult.studentId,
      familyId: txResult.familyId,
      templateIds: txResult.templateIds,
      linkedCounts: txResult.linkedCounts,
    };
  } catch (error) {
    console.error("deleteEnrolment failed", error);
    return { success: false, error: "Unable to delete enrolment." };
  }
}

