import type { ClassTemplate, EnrolmentPlan } from "@prisma/client";

import { BillingType } from "@prisma/client";

import { assertPlanMatchesTemplates } from "@/server/enrolment/planCompatibility";

export type TemplateSummary = Pick<
  ClassTemplate,
  "id" | "levelId" | "active" | "startDate" | "endDate" | "dayOfWeek" | "startTime" | "name" | "capacity"
>;

type ResolveTemplatesParams = {
  plan: EnrolmentPlan;
  selectedIds: string[];
  templatesById: Map<string, TemplateSummary>;
  levelTemplates: TemplateSummary[];
  startDate: Date;
};

export function resolveTransitionTemplates({
  plan,
  selectedIds,
  templatesById,
  levelTemplates,
  startDate,
}: ResolveTemplatesParams) {
  const uniqueSelectedIds = Array.from(new Set(selectedIds));
  if (uniqueSelectedIds.length !== selectedIds.length) {
    throw new Error("Choose each class only once.");
  }

  let templates = uniqueSelectedIds
    .map((id) => templatesById.get(id))
    .filter((template): template is TemplateSummary => Boolean(template));

  if (templates.length !== uniqueSelectedIds.length) {
    throw new Error("Missing enrolment plan or class template.");
  }

  if (plan.billingType === BillingType.PER_WEEK && templates.length === 0) {
    templates = levelTemplates.filter((template) => {
      if (template.active === false) return false;
      if (template.startDate > startDate) return false;
      if (template.endDate && template.endDate < startDate) return false;
      return template.levelId === plan.levelId;
    });
  }

  if (plan.billingType === BillingType.PER_WEEK && templates.length === 0) {
    throw new Error("No active classes for this level.");
  }

  const inactiveTemplate = templates.find((template) => template.active === false);
  if (inactiveTemplate) {
    throw new Error("Select active classes that match the plan level.");
  }

  const mismatchedLevel = templates.find((template) => template.levelId !== plan.levelId);
  if (mismatchedLevel) {
    throw new Error("Class level must match the enrolment plan level.");
  }

  if (plan.billingType === BillingType.PER_CLASS) {
    const requiredCount = Math.max(1, plan.sessionsPerWeek ?? 1);
    if (templates.length > requiredCount) {
      throw new Error(`Select up to ${requiredCount} classes for this plan.`);
    }
    if (templates.length < requiredCount) {
      throw new Error(`Select ${requiredCount} classes for this plan.`);
    }
  }

  assertPlanMatchesTemplates(plan, templates);

  return templates;
}

export function resolveAnchorTemplate(templates: Array<Pick<ClassTemplate, "id" | "dayOfWeek" | "startTime">>) {
  if (templates.length === 0) return null;
  const sorted = [...templates].sort((a, b) => {
    const dayA = a.dayOfWeek ?? 7;
    const dayB = b.dayOfWeek ?? 7;
    if (dayA !== dayB) return dayA - dayB;
    const timeA = a.startTime ?? 0;
    const timeB = b.startTime ?? 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}
