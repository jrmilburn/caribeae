type EnrolmentStatusLike = "ACTIVE" | "CHANGEOVER" | (string & {});

type ClassVisibilityEnrolment = {
  status: EnrolmentStatusLike;
  startDate: Date | string;
  endDate?: Date | string | null;
};

type PayableEnrolment = {
  status: EnrolmentStatusLike;
  paidThroughDate?: Date | string | null;
  endDate?: Date | string | null;
};

const VISIBLE_STATUSES = new Set<EnrolmentStatusLike>(["ACTIVE", "CHANGEOVER"]);

function asDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function enrolmentIsVisibleOnClass(enrolment: ClassVisibilityEnrolment, date: Date | string | null) {
  if (!VISIBLE_STATUSES.has(enrolment.status)) return false;
  const start = asDate(enrolment.startDate);
  const end = asDate(enrolment.endDate ?? null);
  const target = asDate(date ?? null);
  if (!start || !target) return false;
  if (target < start) return false;
  if (end && target > end) return false;
  return true;
}

export function enrolmentIsPayable(enrolment: PayableEnrolment) {
  if (!VISIBLE_STATUSES.has(enrolment.status)) return false;
  const paidThrough = asDate(enrolment.paidThroughDate ?? null);
  const end = asDate(enrolment.endDate ?? null);
  if (!paidThrough) return true;
  if (!end) return true;
  return paidThrough < end;
}
