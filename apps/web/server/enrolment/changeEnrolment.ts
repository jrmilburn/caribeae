"use server";

import { revalidatePath } from "next/cache";
import { EnrolmentStatus } from "@prisma/client";
import { isAfter, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getSelectionRequirement, normalizeStartDate, resolvePlannedEndDate } from "@/server/enrolment/planRules";
import { validateSelection } from "@/server/enrolment/validateSelection";
import {
  CoverageWouldShortenError,
  recalculateEnrolmentCoverage,
} from "@/server/billing/recalculateEnrolmentCoverage";
import { EnrolmentValidationError, validateNoDuplicateEnrolments } from "./enrolmentValidation";
import { assertPlanMatchesTemplates } from "./planCompatibility";

type ChangeEnrolmentInput = {
  enrolmentId: string;
  templateIds: string[];
  startDate?: string;
  effectiveLevelId?: string | null;
  confirmShorten?: boolean;
};

export async function changeEnrolment(input: ChangeEnrolmentInput) {
  const user = await getOrCreateUser();
  await requireAdmin();

  if (!input.templateIds.length) {
    throw new Error("Select at least one class template.");
  }

  const payload = {
    enrolmentId: input.enrolmentId,
    templateIds: Array.from(new Set(input.templateIds)),
    startDate: input.startDate ? normalizeStartDate(input.startDate) : null,
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: payload.enrolmentId },
      include: {
        plan: true,
        student: true,
        template: true,
        classAssignments: true,
      },
    });

    if (!enrolment) throw new Error("Enrolment not found.");
    if (!enrolment.plan) throw new Error("Enrolment plan missing.");

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

    const mismatchedTemplate = templates.find(
      (template) => template.levelId && template.levelId !== effectiveLevelId
    );
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

    const selectionRequirement = getSelectionRequirement(enrolment.plan);
    if (selectionRequirement.requiredCount > 0 && payload.templateIds.length !== selectionRequirement.requiredCount) {
      throw new Error(`Select ${selectionRequirement.requiredCount} classes for this plan.`);
    }
    if (selectionRequirement.requiredCount === 0 && payload.templateIds.length > selectionRequirement.maxCount) {
      throw new Error(`Select up to ${selectionRequirement.maxCount} classes for this plan.`);
    }

    // -----------------------------
    // Dates / windows (NO redeclares)
    // -----------------------------
    const baseStart = payload.startDate ?? startOfDay(enrolment.startDate);

    // This is a LIMIT/CAP used when validating windows, not necessarily the final planned end date.
    const currentEndLimit = enrolment.endDate ? startOfDay(enrolment.endDate) : null;

    const windows = templates.map((template) => {
      const templateStart = startOfDay(template.startDate);
      const templateEnd = template.endDate ? startOfDay(template.endDate) : null;

      // enrolment can't start before template starts
      const startDate = baseStart < templateStart ? templateStart : baseStart;

      // end date can't exceed either existing enrolment end (if any) or template end (if any)
      let endDate = currentEndLimit;
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

      return {
        templateId: template.id,
        templateName: template.name ?? "class",
        startDate,
        endDate,
      };
    });

    const existing = await tx.enrolment.findMany({
      where: {
        studentId: enrolment.studentId,
        OR: [
          { templateId: { in: payload.templateIds } },
          { classAssignments: { some: { templateId: { in: payload.templateIds } } } },
        ],
        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] },
      },
      select: { id: true, templateId: true, startDate: true, endDate: true, status: true },
    });

    validateNoDuplicateEnrolments({
      candidateWindows: windows,
      existingEnrolments: existing,
      ignoreEnrolmentIds: new Set([enrolment.id]),
    });

    const existingAssignments = new Set(enrolment.classAssignments.map((a) => a.templateId));
    const nextAssignments = new Set(payload.templateIds);

    const toAdd = payload.templateIds.filter((id) => !existingAssignments.has(id));
    const toRemove = enrolment.classAssignments
      .map((a) => a.templateId)
      .filter((id) => !nextAssignments.has(id));

    if (toAdd.length) {
      await tx.enrolmentClassAssignment.createMany({
        data: toAdd.map((templateId) => ({ enrolmentId: enrolment.id, templateId })),
        skipDuplicates: true,
      });
    }

    if (toRemove.length) {
      await tx.enrolmentClassAssignment.deleteMany({
        where: { enrolmentId: enrolment.id, templateId: { in: toRemove } },
      });
    }

    const anchorTemplate = templates
      .slice()
      .sort((a, b) => {
        const dayA = a.dayOfWeek ?? 7;
        const dayB = b.dayOfWeek ?? 7;
        if (dayA !== dayB) return dayA - dayB;
        return a.id.localeCompare(b.id);
      })[0];

    // Compute the earliest template end date (if any) to cap the planned end date.
    const templateEndDates = windows.map((w) => w.endDate).filter(Boolean) as Date[];
    const earliestEnd =
      templateEndDates.length > 0
        ? templateEndDates.reduce((acc, end) => (acc < end ? acc : end))
        : null;

    // This is the FINAL planned end date according to plan rules + any caps.
    const plannedEndDate = resolvePlannedEndDate(enrolment.plan, baseStart, enrolment.endDate ?? null, earliestEnd);

    await tx.enrolment.update({
      where: { id: enrolment.id },
      data: {
        templateId: anchorTemplate?.id ?? enrolment.templateId,
        startDate: baseStart,
        endDate: plannedEndDate,
      },
    });

    const updated = await tx.enrolment.findUnique({
      where: { id: enrolment.id },
      include: { student: true, template: true, plan: true, classAssignments: true },
    });

    if (!updated) throw new Error("Enrolment not found after update.");

    await recalculateEnrolmentCoverage(updated.id, "CLASS_CHANGED", {
      tx,
      actorId: user.id,
      confirmShorten: input.confirmShorten,
    });

      return {
        enrolments: [updated],
        templateIds: Array.from(new Set([...toAdd, ...toRemove])),
        studentId: enrolment.studentId,
        originalTemplates: enrolment.classAssignments.map((a) => a.templateId),
      };
    });

    const allTemplates = new Set<string>([...result.templateIds, ...result.originalTemplates]);
    result.enrolments.forEach((e) => {
      if (e.templateId) allTemplates.add(e.templateId);
    });

    revalidatePath(`/admin/student/${result.studentId}`);
    allTemplates.forEach((id) => revalidatePath(`/admin/class/${id}`));
    revalidatePath("/admin/enrolment");

    return { ok: true as const, data: result };
  } catch (error) {
    if (error instanceof CoverageWouldShortenError) {
      return {
        ok: false as const,
        error: {
          code: "COVERAGE_WOULD_SHORTEN",
          oldDateKey: error.oldDateKey,
          newDateKey: error.newDateKey,
        },
      };
    }
    throw error;
  }
}
