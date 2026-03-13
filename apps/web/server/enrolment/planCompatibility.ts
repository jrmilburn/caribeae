import type { ClassTemplate, EnrolmentPlan } from "@prisma/client";

import { isDayOfWeekCompatibleWithPlan, isSaturdayDayOfWeek } from "@/lib/enrolment/planDayCompatibility";

export function isSaturdayTemplate(template: Pick<ClassTemplate, "dayOfWeek">) {
  return isSaturdayDayOfWeek(template.dayOfWeek);
}

export function assertPlanMatchesTemplate(
  plan: Pick<EnrolmentPlan, "isSaturdayOnly" | "name" | "billingType">,
  template: Pick<ClassTemplate, "dayOfWeek" | "name">
) {
  if (template.dayOfWeek === null || typeof template.dayOfWeek === "undefined") {
    throw new Error("Class template is missing a day of week. Set the schedule before enrolling.");
  }

  const saturdayTemplate = isSaturdayTemplate(template);
  const compatible = isDayOfWeekCompatibleWithPlan(plan, template.dayOfWeek);

  if (!compatible && saturdayTemplate) {
    throw new Error("Saturday classes require a Saturday-only enrolment plan.");
  }

  if (!compatible && !saturdayTemplate) {
    throw new Error("Saturday-only enrolment plans can only be used for Saturday classes.");
  }
}

export function assertPlanMatchesTemplates(
  plan: Pick<EnrolmentPlan, "isSaturdayOnly" | "name" | "billingType">,
  templates: Array<Pick<ClassTemplate, "dayOfWeek" | "name">>
) {
  templates.forEach((template) => assertPlanMatchesTemplate(plan, template));
}
