"use server";

import { revalidatePath } from "next/cache";
import { EnrolmentStatus } from "@prisma/client";
import { startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizePlan, normalizeStartDate } from "@/server/enrolment/planRules";
import { validateSelection } from "@/server/enrolment/validateSelection";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";

type ChangeEnrolmentInput = {
  enrolmentId: string;
  templateIds: string[];
  startDate?: string;
};

export async function changeEnrolment(input: ChangeEnrolmentInput) {
  await getOrCreateUser();
  await requireAdmin();

  if (!input.templateIds.length) {
    throw new Error("Select at least one class template.");
  }

  const payload = {
    enrolmentId: input.enrolmentId,
    templateIds: Array.from(new Set(input.templateIds)),
    startDate: input.startDate ? normalizeStartDate(input.startDate) : null,
  };

  const result = await prisma.$transaction(async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: payload.enrolmentId },
      include: {
        plan: true,
        student: true,
        template: true,
      },
    });

    if (!enrolment) {
      throw new Error("Enrolment not found.");
    }
    if (!enrolment.plan) {
      throw new Error("Enrolment plan missing.");
    }

    const templates = await tx.classTemplate.findMany({
      where: { id: { in: payload.templateIds } },
      select: { id: true, levelId: true, active: true },
    });

    const selectionValidation = validateSelection({
      plan: enrolment.plan,
      templateIds: payload.templateIds,
      templates,
    });
    if (!selectionValidation.ok) {
      throw new Error(selectionValidation.message ?? "Invalid selection for enrolment plan.");
    }

    const normalizedPlan = normalizePlan(enrolment.plan);
    const requiredCount = Math.max(1, normalizedPlan.sessionsPerWeek);
    if (payload.templateIds.length !== requiredCount) {
      throw new Error(`Select ${requiredCount} classes for this plan.`);
    }

    const siblings = await tx.enrolment.findMany({
      where: {
        studentId: enrolment.studentId,
        planId: enrolment.planId,
        status: { not: EnrolmentStatus.CANCELLED },
      },
      include: { template: true },
      orderBy: { createdAt: "asc" },
    });

    if (siblings.length > requiredCount) {
      throw new Error(
        "Too many active enrolments for this plan. Undo extras before changing the selection."
      );
    }

    const startDate = payload.startDate ?? startOfDay(enrolment.startDate);
    const touchedTemplates = new Set<string>();
    const updatedEnrolments: string[] = [];
    const originalTemplates = siblings.map((s) => s.templateId);

    const available = [...siblings];
    for (const templateId of payload.templateIds) {
      const existing = available.find((e) => e.templateId === templateId);
      if (existing) {
        touchedTemplates.add(existing.templateId);
        if (payload.startDate) {
          await tx.enrolment.update({
            where: { id: existing.id },
            data: { startDate },
          });
          updatedEnrolments.push(existing.id);
        }
        available.splice(available.indexOf(existing), 1);
        continue;
      }

      const reusable = available.shift();
      if (reusable) {
        await tx.enrolment.update({
          where: { id: reusable.id },
          data: {
            templateId,
            startDate,
            endDate: reusable.endDate,
            status: reusable.status,
            cancelledAt: null,
          },
        });
        touchedTemplates.add(templateId);
        updatedEnrolments.push(reusable.id);
        continue;
      }

      const created = await tx.enrolment.create({
        data: {
          studentId: enrolment.studentId,
          planId: enrolment.planId,
          templateId,
          startDate,
          endDate: enrolment.endDate,
          status: enrolment.status,
          paidThroughDate: enrolment.paidThroughDate,
          paidThroughDateComputed: enrolment.paidThroughDateComputed,
          creditsRemaining: enrolment.creditsRemaining,
          creditsBalanceCached: enrolment.creditsBalanceCached,
          nextDueDateComputed: enrolment.nextDueDateComputed,
        },
      });
      touchedTemplates.add(templateId);
      updatedEnrolments.push(created.id);
    }

    if (available.length && siblings.length === requiredCount) {
      // Cancel any remaining enrolments not part of the required selection.
      for (const extra of available) {
        await tx.enrolment.update({
          where: { id: extra.id },
          data: {
            status: EnrolmentStatus.CANCELLED,
            cancelledAt: extra.cancelledAt ?? new Date(),
          },
        });
        updatedEnrolments.push(extra.id);
      }
    }

    const updated = await tx.enrolment.findMany({
      where: { id: { in: updatedEnrolments.length ? updatedEnrolments : [enrolment.id] } },
      include: { student: true, template: true, plan: true },
    });

    // Refresh billing snapshots for touched enrolments
    const toRefresh = updated.map((e) => e.id);
    for (const id of toRefresh) {
      await getEnrolmentBillingStatus(id, { client: tx });
    }

    return {
      enrolments: updated,
      templateIds: Array.from(touchedTemplates),
      studentId: enrolment.studentId,
      originalTemplates,
    };
  });

  const allTemplates = new Set<string>([...result.templateIds, ...result.originalTemplates]);
  result.enrolments.forEach((e) => {
    if (e.templateId) allTemplates.add(e.templateId);
  });

  revalidatePath(`/admin/student/${result.studentId}`);
  allTemplates.forEach((id) => revalidatePath(`/admin/class/${id}`));
  revalidatePath("/admin/enrolment");

  return result;
}
