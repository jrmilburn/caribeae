import type { ClassTemplate, EnrolmentPlan } from "@prisma/client";

export function isSaturdayTemplate(template: Pick<ClassTemplate, "dayOfWeek">) {
  return template.dayOfWeek === 5;
}

export function assertPlanMatchesTemplate(
  plan: Pick<EnrolmentPlan, "isSaturdayOnly" | "name">,
  template: Pick<ClassTemplate, "dayOfWeek" | "name">
) {
  if (template.dayOfWeek === null || typeof template.dayOfWeek === "undefined") {
    throw new Error("Class template is missing a day of week. Set the schedule before enrolling.");
  }

  const saturdayTemplate = isSaturdayTemplate(template);
  if (saturdayTemplate && !plan.isSaturdayOnly) {
    throw new Error("Saturday classes require a Saturday-only enrolment plan.");
  }

  if (!saturdayTemplate && plan.isSaturdayOnly) {
    throw new Error("Saturday-only enrolment plans can only be used for Saturday classes.");
  }
}

export function assertPlanMatchesTemplates(
  plan: Pick<EnrolmentPlan, "isSaturdayOnly" | "name">,
  templates: Array<Pick<ClassTemplate, "dayOfWeek" | "name">>
) {
  templates.forEach((template) => assertPlanMatchesTemplate(plan, template));
}
