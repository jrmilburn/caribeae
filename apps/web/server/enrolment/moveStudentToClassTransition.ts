import { isAfter, isBefore } from "date-fns";

import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

export function resolveMoveStudentTransitionDates(params: {
  startDate: Date;
  endDate: Date;
  requestedNewPaidThroughDate: Date | null;
  currentPaidThroughDate: Date | null;
}) {
  const startDate = brisbaneStartOfDay(params.startDate);
  const endDate = brisbaneStartOfDay(params.endDate);

  if (isAfter(endDate, startDate)) {
    throw new Error("End current enrolment must be on or before start new enrolment.");
  }

  const newPaidThroughDate = params.requestedNewPaidThroughDate
    ? brisbaneStartOfDay(params.requestedNewPaidThroughDate)
    : params.currentPaidThroughDate
      ? brisbaneStartOfDay(params.currentPaidThroughDate)
      : null;

  if (!newPaidThroughDate) {
    throw new Error("New paid through date is required.");
  }

  if (isBefore(newPaidThroughDate, startDate)) {
    throw new Error("New paid through date must be on or after start new enrolment.");
  }

  return {
    startDate,
    endDate,
    newPaidThroughDate,
  };
}
