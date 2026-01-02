import { EnrolmentPlan } from "@prisma/client";

import { getSelectionRequirement } from "./planRules";

type TemplateLike = {
  id: string;
  levelId: string;
  active: boolean | null;
};

export function validateSelection(params: {
  plan: EnrolmentPlan;
  templateIds: string[];
  templates: TemplateLike[];
}) {
  const uniqueIds = Array.from(new Set(params.templateIds));
  if (uniqueIds.length !== params.templateIds.length) {
    return { ok: false, message: "Choose each class only once." };
  }

  const requirement = getSelectionRequirement(params.plan);
  if (uniqueIds.length !== requirement.requiredCount) {
    return {
      ok: false,
      message: requirement.helper,
    };
  }

  const invalidTemplates = params.templates.filter((t) => t.active === false);
  if (invalidTemplates.length) {
    return { ok: false, message: "Select active classes that match the plan level." };
  }

  const mismatchedLevel = params.templates.find((t) => t.levelId !== params.plan.levelId);
  if (mismatchedLevel) {
    return { ok: false, message: "Class level must match the enrolment plan level." };
  }

  return { ok: true };
}
