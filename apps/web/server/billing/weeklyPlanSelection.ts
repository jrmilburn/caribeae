import { BillingType, type ClassTemplate, type EnrolmentPlan } from "@prisma/client";

import { assertPlanMatchesTemplates } from "@/server/enrolment/planCompatibility";

export type WeeklyPlanOption = Pick<
  EnrolmentPlan,
  "id" | "name" | "priceCents" | "durationWeeks" | "sessionsPerWeek" | "isSaturdayOnly" | "billingType" | "levelId"
>;

type TemplateInfo = Pick<ClassTemplate, "dayOfWeek" | "name" | "levelId">;

export function resolveEnrolmentTemplates(params: {
  template?: TemplateInfo | null;
  assignedTemplates?: TemplateInfo[];
}) {
  const assigned = (params.assignedTemplates ?? []).filter(Boolean);
  if (assigned.length) return assigned;
  return params.template ? [params.template] : [];
}

export function assertWeeklyPlanSelection(params: {
  plan: WeeklyPlanOption;
  currentLevelId: string | null;
  templates: TemplateInfo[];
}) {
  if (params.plan.billingType !== BillingType.PER_WEEK) {
    throw new Error("Only weekly plans can be selected for this enrolment.");
  }
  if (!params.plan.durationWeeks || params.plan.durationWeeks <= 0) {
    throw new Error("Weekly plans require a valid duration.");
  }
  if (params.currentLevelId && params.plan.levelId !== params.currentLevelId) {
    throw new Error("Selected plan must match the enrolment level.");
  }
  const templatesWithDays = params.templates.filter(
    (template) => template.dayOfWeek !== null && typeof template.dayOfWeek !== "undefined"
  );
  if (!templatesWithDays.length) return;
  assertPlanMatchesTemplates(params.plan, templatesWithDays);
}

export function filterWeeklyPlanOptions(params: {
  plans: WeeklyPlanOption[];
  currentLevelId: string | null;
  templates: TemplateInfo[];
}) {
  return params.plans.filter((plan) => {
    try {
      assertWeeklyPlanSelection({ plan, currentLevelId: params.currentLevelId, templates: params.templates });
      return true;
    } catch {
      return false;
    }
  });
}
