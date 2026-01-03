import { EnrolmentStatus } from "@prisma/client";
import { startOfDay } from "date-fns";

export type EnrolmentWindow = {
  templateId: string;
  startDate: Date;
  endDate: Date | null;
  templateName?: string;
  enrolmentId?: string;
};

export type ExistingEnrolment = {
  id: string;
  templateId: string;
  startDate: Date;
  endDate: Date | null;
  status: EnrolmentStatus;
};

export type ValidationIssue = {
  code: "DUPLICATE_ENROLMENT" | "INVALID_DATE_RANGE";
  templateId: string;
  message: string;
  conflictingEnrolmentId?: string;
};

export class EnrolmentValidationError extends Error {
  code: ValidationIssue["code"];
  details: ValidationIssue;

  constructor(issue: ValidationIssue) {
    super(issue.message);
    this.code = issue.code;
    this.details = issue;
  }
}

const BLOCKING_STATUSES = [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED];

export function overlaps(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null) {
  const aEndSafe = aEnd ?? new Date(8640000000000000);
  const bEndSafe = bEnd ?? new Date(8640000000000000);
  return aStart <= bEndSafe && bStart <= aEndSafe;
}

export function validateNoDuplicateEnrolments(params: {
  candidateWindows: EnrolmentWindow[];
  existingEnrolments: ExistingEnrolment[];
  ignoreEnrolmentIds?: Set<string>;
  treatPausedAsActive?: boolean;
}) {
  const ignoreIds = params.ignoreEnrolmentIds ?? new Set<string>();
  const blockingStatuses = params.treatPausedAsActive === false ? [EnrolmentStatus.ACTIVE] : BLOCKING_STATUSES;

  const normalizedExisting = params.existingEnrolments
    .filter((row) => blockingStatuses.includes(row.status) && !ignoreIds.has(row.id))
    .map((row) => ({
      ...row,
      startDate: startOfDay(row.startDate),
      endDate: row.endDate ? startOfDay(row.endDate) : null,
    }));

  const normalizedCandidates = params.candidateWindows.map((window) => ({
    ...window,
    startDate: startOfDay(window.startDate),
    endDate: window.endDate ? startOfDay(window.endDate) : null,
  }));

  for (const window of normalizedCandidates) {
    const conflict = normalizedExisting.find(
      (row) => row.templateId === window.templateId && overlaps(window.startDate, window.endDate, row.startDate, row.endDate)
    );
    if (conflict) {
      throw new EnrolmentValidationError({
        code: "DUPLICATE_ENROLMENT",
        templateId: window.templateId,
        conflictingEnrolmentId: conflict.id,
        message: `Student is already enrolled in ${window.templateName ?? "this class"} for the selected dates.`,
      });
    }
  }
}
