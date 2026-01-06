"use server";

import { revalidatePath } from "next/cache";
import { EnrolmentStatus } from "@prisma/client";
import { isAfter, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizePlan, normalizeStartDate } from "@/server/enrolment/planRules";
import { validateSelection } from "@/server/enrolment/validateSelection";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";
import { EnrolmentValidationError, validateNoDuplicateEnrolments } from "./enrolmentValidation";
import { assertPlanMatchesTemplates } from "./planCompatibility";

type ChangeEnrolmentInput = {
  enrolmentId: string;
  templateIds: string[];
  startDate?: string;
  effectiveLevelId?: string | null;
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

    const effectiveLevelId = input.effectiveLevelId ?? enrolment.student?.levelId ?? null;
    if (!effectiveLevelId) {
      throw new Error("Set the student's level before changing this enrolment.");
    }
    if (enrolment.plan.levelId !== effectiveLevelId) {
      throw new Error("Enrolment plan level must match the selected level.");
    }

    const templates = await tx.classTemplate.findMany({
      where: { id: { in: payload.templateIds } },
      select: {
        id: true,
        levelId: true,
        active: true,
        startDate: true,
        endDate: true,
        name: true,
        dayOfWeek: true,
      },
    });

    const missingLevelTemplate = templates.find((template) => !template.levelId);
    if (missingLevelTemplate) {
      throw new Error("Selected classes must have a level set before enrolling.");
    }
    const mismatchedTemplate = templates.find((template) => template.levelId && template.levelId !== effectiveLevelId);
    if (mismatchedTemplate) {
      throw new Error("Selected classes must match the student's level.");
    }

    assertPlanMatchesTemplates(enrolment.plan, templates);

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

    const enrolmentEnd = enrolment.endDate ? startOfDay(enrolment.endDate) : null;
    const baseStart = payload.startDate ?? startOfDay(enrolment.startDate);
    const windows = templates.map((template) => {
      const templateStart = startOfDay(template.startDate);
      const templateEnd = template.endDate ? startOfDay(template.endDate) : null;
      const startDate = baseStart < templateStart ? templateStart : baseStart;

      let endDate = enrolmentEnd;
      if (templateEnd && (!endDate || isAfter(endDate, templateEnd))) {
        endDate = templateEnd;
      }

      if (endDate && isAfter(startDate, endDate)) {
        throw new EnrolmentValidationError({
          code: "INVALID_DATE_RANGE",
          templateId: template.id,
          message: `Start date must be on or before the class end date for ${template.name ?? "this class"}.`,
        });
      }

      return { templateId: template.id, templateName: template.name ?? "class", startDate, endDate };
    });

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

    const existing = await tx.enrolment.findMany({
      where: {
        studentId: enrolment.studentId,
        templateId: { in: payload.templateIds },
        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] },
      },
      select: { id: true, templateId: true, startDate: true, endDate: true, status: true },
    });

    validateNoDuplicateEnrolments({
      candidateWindows: windows,
      existingEnrolments: existing,
      ignoreEnrolmentIds: new Set(siblings.map((s) => s.id)),
    });

    const windowByTemplateId = new Map(windows.map((w) => [w.templateId, w]));
    const touchedTemplates = new Set<string>();
    const updatedEnrolments: string[] = [];
    const originalTemplates = siblings.map((s) => s.templateId);

    const available = [...siblings];
    for (const templateId of payload.templateIds) {
      const window = windowByTemplateId.get(templateId);
      if (!window) continue;

      const existing = available.find((e) => e.templateId === templateId);
      if (existing) {
        touchedTemplates.add(existing.templateId);
        const startDate = startOfDay(existing.startDate);
        const endDate = existing.endDate ? startOfDay(existing.endDate) : null;
        const needsStartUpdate = startDate.getTime() !== window.startDate.getTime();
        const needsEndUpdate = (endDate?.getTime() ?? null) !== (window.endDate?.getTime() ?? null);
        if (needsStartUpdate || needsEndUpdate) {
          await tx.enrolment.update({
            where: { id: existing.id },
            data: { startDate: window.startDate, endDate: window.endDate },
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
            startDate: window.startDate,
            endDate: window.endDate,
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
          startDate: window.startDate,
          endDate: window.endDate,
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
