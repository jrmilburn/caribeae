import { addDays, isAfter, isBefore } from "date-fns";
import type { EnrolmentPlan } from "@prisma/client";

import { resolvePlannedEndDate } from "@/server/enrolment/planRules";

export function resolveMoveClassDates(params: {
  effectiveDate: Date;
  enrolmentStart: Date;
  enrolmentEnd: Date | null;
  templateStart: Date;
  templateEnd: Date | null;
  plan: Pick<EnrolmentPlan, "billingType" | "durationWeeks">;
}) {
  const alignedStart = isBefore(params.effectiveDate, params.templateStart)
    ? params.templateStart
    : params.effectiveDate;
  if (params.templateEnd && isAfter(alignedStart, params.templateEnd)) {
    throw new Error("Effective date is after the destination class ends.");
  }

  const plannedEnd = resolvePlannedEndDate(params.plan, alignedStart, params.enrolmentEnd, params.templateEnd);
  const endBoundary = addDays(alignedStart, -1);
  let effectiveEnd = isBefore(endBoundary, params.enrolmentStart) ? params.enrolmentStart : endBoundary;
  if (params.enrolmentEnd && isBefore(params.enrolmentEnd, effectiveEnd)) {
    effectiveEnd = params.enrolmentEnd;
  }

  return { alignedStart, plannedEnd, effectiveEnd };
}
