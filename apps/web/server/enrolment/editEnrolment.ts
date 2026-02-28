"use server";

import { revalidatePath } from "next/cache";
import { EnrolmentStatus, type Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import {
  ENROLMENT_STATUS_VALUES,
  type EnrolmentEditContextSource,
  type EnrolmentEditFieldErrors,
  type EnrolmentEditFormValues,
  type EnrolmentEditSheetData,
  type EnrolmentEditSnapshot,
  type EnrolmentPlanSummary,
  type EnrolmentTemplateSummary,
  normalizeEnrolmentFormValues,
  normalizeTemplateIds,
  validateEnrolmentFormValues,
} from "@/lib/enrolment/editEnrolmentModel";
import { toBrisbaneDayKey, brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { getSelectionRequirement } from "@/server/enrolment/planRules";
import { assertPlanMatchesTemplates } from "@/server/enrolment/planCompatibility";
import {
  EnrolmentValidationError,
  validateNoDuplicateEnrolments,
} from "@/server/enrolment/enrolmentValidation";
import {
  adjustCreditsForManualPaidThroughDate,
  getEnrolmentBillingStatus,
} from "@/server/billing/enrolmentBilling";
import { recalculateEnrolmentCoverage } from "@/server/billing/recalculateEnrolmentCoverage";

type UpdateErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "UNKNOWN_ERROR";

type GetEnrolmentForEditResult =
  | {
      ok: true;
      data: EnrolmentEditSheetData;
    }
  | {
      ok: false;
      error: {
        code: "NOT_FOUND" | "UNKNOWN_ERROR";
        message: string;
      };
    };

type UpdateEnrolmentForEditResult =
  | {
      ok: true;
      data: {
        enrolment: EnrolmentEditSnapshot;
      };
    }
  | {
      ok: false;
      error: {
        code: UpdateErrorCode;
        message: string;
        fieldErrors?: EnrolmentEditFieldErrors;
        latest?: EnrolmentEditSheetData;
      };
    };

const updateInputSchema = z.object({
  enrolmentId: z.string().min(1),
  expectedUpdatedAt: z.string().datetime(),
  values: z.object({
    status: z.enum(ENROLMENT_STATUS_VALUES),
    startDate: z.string(),
    endDate: z.string(),
    planId: z.string(),
    paidThroughDate: z.string(),
    cancelledAt: z.string(),
    templateIds: z.array(z.string()),
    isBillingPrimary: z.boolean(),
    billingGroupId: z.string(),
    billingPrimaryId: z.string(),
  }),
  context: z
    .object({
      source: z.enum(["class", "family", "student"]),
      sourceId: z.string().min(1).optional(),
    })
    .optional(),
});

const ENROLMENT_INCLUDE = {
  student: {
    select: {
      id: true,
      name: true,
      familyId: true,
    },
  },
  plan: true,
  template: {
    include: {
      level: true,
    },
  },
  classAssignments: {
    include: {
      template: {
        include: {
          level: true,
        },
      },
    },
  },
} satisfies Prisma.EnrolmentInclude;

type EnrolmentWithEditRelations = Prisma.EnrolmentGetPayload<{
  include: typeof ENROLMENT_INCLUDE;
}>;

type TemplateWithLevel = Prisma.ClassTemplateGetPayload<{
  include: {
    level: true;
  };
}>;

type TxClient = Prisma.TransactionClient;

type PlanSummarySource = {
  id: string;
  name: string;
  levelId: string;
  billingType: "PER_WEEK" | "PER_CLASS";
  priceCents: number;
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  blockClassCount: number | null;
  alternatingWeeks: boolean;
  isSaturdayOnly: boolean;
};

const FORM_FIELD_KEYS: Array<keyof EnrolmentEditFormValues> = [
  "status",
  "startDate",
  "endDate",
  "planId",
  "paidThroughDate",
  "cancelledAt",
  "templateIds",
  "isBillingPrimary",
  "billingGroupId",
  "billingPrimaryId",
];

function toDateKey(value: Date | string | null | undefined) {
  if (!value) return "";
  try {
    return toBrisbaneDayKey(value);
  } catch {
    return "";
  }
}

function dateKeyToDateOrNull(value: string) {
  if (!value) return null;
  return brisbaneStartOfDay(value);
}

function sameDateKey(left: Date | string | null | undefined, right: Date | string | null | undefined) {
  return toDateKey(left) === toDateKey(right);
}

function resolveTemplateIds(enrolment: Pick<EnrolmentWithEditRelations, "templateId" | "classAssignments">) {
  return normalizeTemplateIds([
    enrolment.templateId,
    ...enrolment.classAssignments.map((assignment) => assignment.templateId),
  ]);
}

function resolveAnchorTemplate(templates: TemplateWithLevel[]) {
  const sorted = [...templates].sort((a, b) => {
    const dayA = a.dayOfWeek ?? 7;
    const dayB = b.dayOfWeek ?? 7;
    if (dayA !== dayB) return dayA - dayB;
    const startA = a.startTime ?? 0;
    const startB = b.startTime ?? 0;
    if (startA !== startB) return startA - startB;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}

function serializeTemplate(template: TemplateWithLevel): EnrolmentTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    levelId: template.levelId,
    levelName: template.level?.name ?? null,
    dayOfWeek: template.dayOfWeek,
    startTime: template.startTime,
    endTime: template.endTime,
    active: Boolean(template.active),
    startDate: toDateKey(template.startDate),
    endDate: toDateKey(template.endDate),
  };
}

function serializePlan(plan: PlanSummarySource): EnrolmentPlanSummary {
  return {
    id: plan.id,
    name: plan.name,
    levelId: plan.levelId,
    billingType: plan.billingType,
    priceCents: plan.priceCents,
    durationWeeks: plan.durationWeeks,
    sessionsPerWeek: plan.sessionsPerWeek,
    blockClassCount: plan.blockClassCount,
    alternatingWeeks: plan.alternatingWeeks,
    isSaturdayOnly: plan.isSaturdayOnly,
  };
}

function serializeEnrolment(enrolment: EnrolmentWithEditRelations): EnrolmentEditSnapshot {
  const templateIds = resolveTemplateIds(enrolment);

  return {
    id: enrolment.id,
    studentId: enrolment.studentId,
    studentName: enrolment.student.name,
    familyId: enrolment.student.familyId ?? null,
    status: enrolment.status,
    startDate: toDateKey(enrolment.startDate),
    endDate: toDateKey(enrolment.endDate),
    planId: enrolment.planId ?? "",
    paidThroughDate: toDateKey(enrolment.paidThroughDate),
    cancelledAt: toDateKey(enrolment.cancelledAt),
    templateIds,
    templateId: enrolment.templateId,
    isBillingPrimary: enrolment.isBillingPrimary,
    billingGroupId: enrolment.billingGroupId ?? "",
    billingPrimaryId: enrolment.billingPrimaryId ?? "",
    updatedAt: enrolment.updatedAt.toISOString(),
    createdAt: enrolment.createdAt.toISOString(),
    paidThroughDateComputed: toDateKey(enrolment.paidThroughDateComputed),
    nextDueDateComputed: toDateKey(enrolment.nextDueDateComputed),
    creditsRemaining: enrolment.creditsRemaining,
    creditsBalanceCached: enrolment.creditsBalanceCached,
    plan: enrolment.plan ? serializePlan(enrolment.plan) : null,
    template: enrolment.template ? serializeTemplate(enrolment.template) : null,
    classAssignments: enrolment.classAssignments.map((assignment) => ({
      templateId: assignment.templateId,
      template: assignment.template ? serializeTemplate(assignment.template) : null,
    })),
  };
}

async function loadOptions(tx: TxClient, enrolment: EnrolmentWithEditRelations) {
  const currentTemplateIds = resolveTemplateIds(enrolment);

  const [plans, classTemplates] = await Promise.all([
    tx.enrolmentPlan.findMany({
      include: { level: true },
      orderBy: [{ level: { levelOrder: "asc" } }, { billingType: "asc" }, { name: "asc" }],
    }),
    tx.classTemplate.findMany({
      where: {
        OR: [{ active: true }, { id: { in: currentTemplateIds } }],
      },
      include: { level: true },
      orderBy: [{ level: { levelOrder: "asc" } }, { dayOfWeek: "asc" }, { startTime: "asc" }, { name: "asc" }],
    }),
  ]);

  return {
    plans: plans.map((plan) => serializePlan(plan)),
    classTemplates: classTemplates.map((template) => serializeTemplate(template)),
  };
}

async function loadEnrolmentEditSheetData(tx: TxClient, enrolmentId: string): Promise<EnrolmentEditSheetData | null> {
  const enrolment = await tx.enrolment.findUnique({
    where: { id: enrolmentId },
    include: ENROLMENT_INCLUDE,
  });

  if (!enrolment) return null;

  const options = await loadOptions(tx, enrolment);

  return {
    enrolment: serializeEnrolment(enrolment),
    options,
  };
}

function combineFieldErrors(
  primary: EnrolmentEditFieldErrors,
  secondary?: EnrolmentEditFieldErrors | null
): EnrolmentEditFieldErrors {
  if (!secondary) return primary;
  const merged: EnrolmentEditFieldErrors = { ...primary };
  for (const [key, value] of Object.entries(secondary)) {
    if (!value) continue;
    if (!merged[key as keyof EnrolmentEditFieldErrors]) {
      merged[key as keyof EnrolmentEditFieldErrors] = value;
    }
  }
  return merged;
}

function extractFieldErrorsFromZod(error: z.ZodError): EnrolmentEditFieldErrors {
  const fieldErrors: EnrolmentEditFieldErrors = {};

  error.issues.forEach((issue) => {
    const [root, field] = issue.path;
    if (root === "values" && typeof field === "string") {
      if (FORM_FIELD_KEYS.includes(field as keyof EnrolmentEditFormValues)) {
        fieldErrors[field as keyof EnrolmentEditFormValues] = issue.message;
      }
    }
  });

  return fieldErrors;
}

function validateStatusAndDates(values: EnrolmentEditFormValues): EnrolmentEditFieldErrors {
  const errors: EnrolmentEditFieldErrors = {};

  if (values.status === EnrolmentStatus.CANCELLED && !values.cancelledAt) {
    errors.cancelledAt = "Cancelled date is required when status is CANCELLED.";
  }

  return errors;
}

export async function getEnrolmentForEdit(enrolmentId: string): Promise<GetEnrolmentForEditResult> {
  try {
    await getOrCreateUser();
    await requireAdmin();

    const data = await prisma.$transaction((tx) => loadEnrolmentEditSheetData(tx, enrolmentId));
    if (!data) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Enrolment not found.",
        },
      };
    }

    return {
      ok: true,
      data,
    };
  } catch (error) {
    console.error("getEnrolmentForEdit failed", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Unable to load enrolment details.",
      },
    };
  }
}

export async function updateEnrolmentForEdit(input: {
  enrolmentId: string;
  expectedUpdatedAt: string;
  values: EnrolmentEditFormValues;
  context?: {
    source: EnrolmentEditContextSource;
    sourceId?: string;
  };
}): Promise<UpdateEnrolmentForEditResult> {
  const actor = await getOrCreateUser();
  await requireAdmin();

  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please review the highlighted fields.",
        fieldErrors: extractFieldErrorsFromZod(parsed.error),
      },
    };
  }

  const normalizedValues = normalizeEnrolmentFormValues(parsed.data.values);
  const clientFieldErrors = validateEnrolmentFormValues(normalizedValues);
  const statusErrors = validateStatusAndDates(normalizedValues);
  const earlyErrors = combineFieldErrors(clientFieldErrors, statusErrors);

  if (Object.keys(earlyErrors).length > 0) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please review the highlighted fields.",
        fieldErrors: earlyErrors,
      },
    };
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const existing = await tx.enrolment.findUnique({
      where: { id: parsed.data.enrolmentId },
      include: ENROLMENT_INCLUDE,
    });

    if (!existing) {
      return {
        kind: "NOT_FOUND" as const,
      };
    }

    if (existing.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) {
      return {
        kind: "CONFLICT" as const,
      };
    }

    const selectedPlan = await tx.enrolmentPlan.findUnique({
      where: { id: normalizedValues.planId },
      include: { level: true },
    });

    const selectedTemplateIds = normalizeTemplateIds(normalizedValues.templateIds);
    const selectedTemplates = selectedTemplateIds.length
      ? await tx.classTemplate.findMany({
          where: { id: { in: selectedTemplateIds } },
          include: { level: true },
        })
      : [];

    const fieldErrors: EnrolmentEditFieldErrors = {};

    if (!selectedPlan) {
      fieldErrors.planId = "Select a valid plan.";
    }

    if (selectedTemplates.length !== selectedTemplateIds.length) {
      fieldErrors.templateIds = "One or more selected classes could not be found.";
    }

    if (selectedPlan && selectedTemplates.length > 0) {
      const mismatchedTemplate = selectedTemplates.find(
        (template) => template.levelId && template.levelId !== selectedPlan.levelId
      );
      if (mismatchedTemplate) {
        fieldErrors.templateIds = "Selected classes must match the selected plan level.";
      }

      try {
        assertPlanMatchesTemplates(selectedPlan, selectedTemplates);
      } catch (error) {
        fieldErrors.templateIds =
          error instanceof Error ? error.message : "Selected classes are not compatible with this plan.";
      }

      const requirement = getSelectionRequirement(selectedPlan);
      if (requirement.requiredCount > 0 && selectedTemplateIds.length !== requirement.requiredCount) {
        fieldErrors.templateIds = `Select ${requirement.requiredCount} classes for this plan.`;
      }
      if (requirement.requiredCount === 0 && selectedTemplateIds.length > requirement.maxCount) {
        fieldErrors.templateIds = `Select up to ${requirement.maxCount} classes for this plan.`;
      }
    }

    let startDate = dateKeyToDateOrNull(normalizedValues.startDate);
    let endDate = dateKeyToDateOrNull(normalizedValues.endDate);
    const paidThroughDate = dateKeyToDateOrNull(normalizedValues.paidThroughDate);
    let cancelledAt = dateKeyToDateOrNull(normalizedValues.cancelledAt);

    if (!startDate) {
      fieldErrors.startDate = "Start date is required.";
      startDate = brisbaneStartOfDay(existing.startDate);
    }

    if (normalizedValues.endDate && !endDate) {
      fieldErrors.endDate = "End date must be YYYY-MM-DD.";
    }

    if (normalizedValues.paidThroughDate && !paidThroughDate) {
      fieldErrors.paidThroughDate = "Paid-through date must be YYYY-MM-DD.";
    }

    if (normalizedValues.cancelledAt && !cancelledAt) {
      fieldErrors.cancelledAt = "Cancelled date must be YYYY-MM-DD.";
    }

    if (normalizedValues.status === EnrolmentStatus.CANCELLED && !cancelledAt) {
      cancelledAt = brisbaneStartOfDay(new Date());
    }

    if (normalizedValues.status !== EnrolmentStatus.CANCELLED) {
      cancelledAt = null;
    }

    if (normalizedValues.status === EnrolmentStatus.CANCELLED && !endDate) {
      endDate = cancelledAt ?? startDate;
    }

    if (startDate && endDate && endDate < startDate) {
      fieldErrors.endDate = "End date must be on or after start date.";
    }

    if (startDate && paidThroughDate && paidThroughDate < startDate) {
      fieldErrors.paidThroughDate = "Paid-through date cannot be before start date.";
    }

    if (endDate && paidThroughDate && paidThroughDate > endDate) {
      fieldErrors.paidThroughDate = "Paid-through date cannot be after end date.";
    }

    if (startDate && selectedTemplates.length > 0) {
      for (const template of selectedTemplates) {
        const templateStart = brisbaneStartOfDay(template.startDate);
        const templateEnd = template.endDate ? brisbaneStartOfDay(template.endDate) : null;

        if (startDate < templateStart) {
          fieldErrors.startDate = `Start date cannot be before ${template.name ?? "the selected class"} starts.`;
          break;
        }

        if (templateEnd && startDate > templateEnd) {
          fieldErrors.startDate = `Start date cannot be after ${template.name ?? "the selected class"} ends.`;
          break;
        }

        if (templateEnd && endDate && endDate > templateEnd) {
          fieldErrors.endDate = `End date cannot be after ${template.name ?? "the selected class"} ends.`;
          break;
        }
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return {
        kind: "VALIDATION_ERROR" as const,
        fieldErrors,
      };
    }

    try {
      const overlapping = await tx.enrolment.findMany({
        where: {
          studentId: existing.studentId,
          id: { not: existing.id },
          status: {
            in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED, EnrolmentStatus.CHANGEOVER],
          },
          OR: [
            { templateId: { in: selectedTemplateIds } },
            { classAssignments: { some: { templateId: { in: selectedTemplateIds } } } },
          ],
        },
        select: {
          id: true,
          templateId: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      });

      validateNoDuplicateEnrolments({
        candidateWindows: selectedTemplateIds.map((templateId) => ({
          templateId,
          startDate: startDate!,
          endDate,
          templateName: selectedTemplates.find((template) => template.id === templateId)?.name ?? "class",
        })),
        existingEnrolments: overlapping,
      });
    } catch (error) {
      if (error instanceof EnrolmentValidationError) {
        return {
          kind: "VALIDATION_ERROR" as const,
          fieldErrors: {
            templateIds: error.message,
          },
        };
      }
      throw error;
    }

    const anchorTemplate = resolveAnchorTemplate(selectedTemplates);
    if (!anchorTemplate) {
      return {
        kind: "VALIDATION_ERROR" as const,
        fieldErrors: {
          templateIds: "Select at least one class assignment.",
        },
      };
    }

    const previousTemplateIds = resolveTemplateIds(existing);
    const previousPlanId = existing.planId;
    const previousPaidThroughDate = existing.paidThroughDate;

    await tx.enrolment.update({
      where: { id: existing.id },
      data: {
        status: normalizedValues.status,
        startDate: startDate!,
        endDate,
        planId: selectedPlan?.id ?? null,
        paidThroughDate,
        paidThroughDateComputed: paidThroughDate,
        cancelledAt,
        templateId: anchorTemplate.id,
        isBillingPrimary: normalizedValues.isBillingPrimary,
        billingGroupId: normalizedValues.billingGroupId || null,
        billingPrimaryId: normalizedValues.billingPrimaryId || null,
      },
    });

    await tx.enrolmentClassAssignment.deleteMany({
      where: { enrolmentId: existing.id },
    });

    await tx.enrolmentClassAssignment.createMany({
      data: selectedTemplateIds.map((templateId) => ({
        enrolmentId: existing.id,
        templateId,
      })),
      skipDuplicates: true,
    });

    const updated = await tx.enrolment.findUnique({
      where: { id: existing.id },
      include: ENROLMENT_INCLUDE,
    });

    if (!updated) {
      return {
        kind: "NOT_FOUND" as const,
      };
    }

    const paidThroughChanged = !sameDateKey(previousPaidThroughDate, paidThroughDate);
    const planChanged = previousPlanId !== selectedPlan?.id;
    const templatesChanged = previousTemplateIds.join("|") !== selectedTemplateIds.join("|");
    const statusChanged = existing.status !== normalizedValues.status;
    const datesChanged =
      !sameDateKey(existing.startDate, startDate) ||
      !sameDateKey(existing.endDate, endDate) ||
      !sameDateKey(existing.cancelledAt, cancelledAt);

    if (paidThroughChanged) {
      await adjustCreditsForManualPaidThroughDate(tx, updated, paidThroughDate);
      await getEnrolmentBillingStatus(updated.id, { client: tx });
      await tx.enrolmentCoverageAudit.create({
        data: {
          enrolmentId: updated.id,
          reason: "PAIDTHROUGH_MANUAL_EDIT",
          previousPaidThroughDate,
          nextPaidThroughDate: paidThroughDate,
          actorId: actor.id,
        },
      });
    } else if (planChanged || templatesChanged || statusChanged || datesChanged) {
      const reason = planChanged ? "PLAN_CHANGED" : "CLASS_CHANGED";
      await recalculateEnrolmentCoverage(updated.id, reason, {
        tx,
        actorId: actor.id,
        confirmShorten: true,
      });
      await getEnrolmentBillingStatus(updated.id, { client: tx });
    }

    const affectedTemplateIds = normalizeTemplateIds([...previousTemplateIds, ...selectedTemplateIds]);

    return {
      kind: "OK" as const,
      enrolment: updated,
      affectedTemplateIds,
      studentId: updated.studentId,
      familyId: updated.student.familyId,
    };
  });

  if (txResult.kind === "NOT_FOUND") {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Enrolment not found.",
      },
    };
  }

  if (txResult.kind === "CONFLICT") {
    const latest = await prisma.$transaction((tx) => loadEnrolmentEditSheetData(tx, parsed.data.enrolmentId));
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "This enrolment changed while you were editing. Review the latest values and try again.",
        latest: latest ?? undefined,
      },
    };
  }

  if (txResult.kind === "VALIDATION_ERROR") {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please review the highlighted fields.",
        fieldErrors: txResult.fieldErrors,
      },
    };
  }

  txResult.affectedTemplateIds.forEach((templateId) => {
    revalidatePath(`/admin/class/${templateId}`);
  });
  revalidatePath(`/admin/student/${txResult.studentId}`);
  if (txResult.familyId) {
    revalidatePath(`/admin/family/${txResult.familyId}`);
  }
  revalidatePath("/admin/enrolment");

  if (parsed.data.context) {
    console.info("[enrolment.edit] updated", {
      enrolmentId: parsed.data.enrolmentId,
      source: parsed.data.context.source,
      sourceId: parsed.data.context.sourceId ?? null,
    });
  }

  return {
    ok: true,
    data: {
      enrolment: serializeEnrolment(txResult.enrolment),
    },
  };
}
