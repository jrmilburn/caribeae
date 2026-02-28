export const ENROLMENT_STATUS_VALUES = ["ACTIVE", "PAUSED", "CHANGEOVER", "CANCELLED"] as const;

export type EnrolmentStatusValue = (typeof ENROLMENT_STATUS_VALUES)[number];

export type EnrolmentEditContextSource = "class" | "family" | "student";

export type EnrolmentPlanSummary = {
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

export type EnrolmentTemplateSummary = {
  id: string;
  name: string | null;
  levelId: string | null;
  levelName: string | null;
  dayOfWeek: number | null;
  startTime: number | null;
  endTime: number | null;
  active: boolean;
  startDate: string;
  endDate: string;
};

export type EnrolmentClassAssignmentSummary = {
  templateId: string;
  template: EnrolmentTemplateSummary | null;
};

export type EnrolmentEditFormValues = {
  status: EnrolmentStatusValue;
  startDate: string;
  endDate: string;
  planId: string;
  paidThroughDate: string;
  cancelledAt: string;
  templateIds: string[];
  isBillingPrimary: boolean;
  billingGroupId: string;
  billingPrimaryId: string;
};

export type EnrolmentEditFieldErrors = Partial<Record<keyof EnrolmentEditFormValues, string>>;

export type EnrolmentEditSnapshot = EnrolmentEditFormValues & {
  id: string;
  studentId: string;
  studentName: string;
  familyId: string | null;
  templateId: string;
  updatedAt: string;
  createdAt: string;
  paidThroughDateComputed: string;
  nextDueDateComputed: string;
  creditsRemaining: number | null;
  creditsBalanceCached: number | null;
  plan: EnrolmentPlanSummary | null;
  template: EnrolmentTemplateSummary | null;
  classAssignments: EnrolmentClassAssignmentSummary[];
};

export type EnrolmentEditSheetData = {
  enrolment: EnrolmentEditSnapshot;
  options: {
    plans: EnrolmentPlanSummary[];
    classTemplates: EnrolmentTemplateSummary[];
  };
};

export type EnrolmentDiffRow = {
  field: keyof EnrolmentEditFormValues;
  label: string;
  before: string;
  after: string;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DIFF_LABELS: Record<keyof EnrolmentEditFormValues, string> = {
  status: "Status",
  startDate: "Start date",
  endDate: "End date",
  planId: "Plan",
  paidThroughDate: "Paid-through date",
  cancelledAt: "Cancelled at",
  templateIds: "Class assignments",
  isBillingPrimary: "Billing primary",
  billingGroupId: "Billing group ID",
  billingPrimaryId: "Billing primary ID",
};

function normalizeDateString(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return DATE_KEY_PATTERN.test(trimmed) ? trimmed : "";
}

function normalizeString(value: string) {
  return value.trim();
}

export function normalizeTemplateIds(templateIds: string[]) {
  return Array.from(new Set(templateIds.map((value) => value.trim()).filter(Boolean))).sort();
}

export function normalizeEnrolmentFormValues(values: EnrolmentEditFormValues): EnrolmentEditFormValues {
  return {
    status: values.status,
    startDate: normalizeDateString(values.startDate),
    endDate: normalizeDateString(values.endDate),
    planId: normalizeString(values.planId),
    paidThroughDate: normalizeDateString(values.paidThroughDate),
    cancelledAt: normalizeDateString(values.cancelledAt),
    templateIds: normalizeTemplateIds(values.templateIds),
    isBillingPrimary: Boolean(values.isBillingPrimary),
    billingGroupId: normalizeString(values.billingGroupId),
    billingPrimaryId: normalizeString(values.billingPrimaryId),
  };
}

export function buildFormValuesFromSnapshot(snapshot: EnrolmentEditSnapshot): EnrolmentEditFormValues {
  return normalizeEnrolmentFormValues({
    status: snapshot.status,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    planId: snapshot.planId,
    paidThroughDate: snapshot.paidThroughDate,
    cancelledAt: snapshot.cancelledAt,
    templateIds: snapshot.templateIds,
    isBillingPrimary: snapshot.isBillingPrimary,
    billingGroupId: snapshot.billingGroupId,
    billingPrimaryId: snapshot.billingPrimaryId,
  });
}

export function areEnrolmentFormValuesEqual(a: EnrolmentEditFormValues, b: EnrolmentEditFormValues) {
  const left = normalizeEnrolmentFormValues(a);
  const right = normalizeEnrolmentFormValues(b);

  return (
    left.status === right.status &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.planId === right.planId &&
    left.paidThroughDate === right.paidThroughDate &&
    left.cancelledAt === right.cancelledAt &&
    left.isBillingPrimary === right.isBillingPrimary &&
    left.billingGroupId === right.billingGroupId &&
    left.billingPrimaryId === right.billingPrimaryId &&
    left.templateIds.join("|") === right.templateIds.join("|")
  );
}

function parseDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function validateEnrolmentFormValues(values: EnrolmentEditFormValues): EnrolmentEditFieldErrors {
  const next = normalizeEnrolmentFormValues(values);
  const fieldErrors: EnrolmentEditFieldErrors = {};

  if (!ENROLMENT_STATUS_VALUES.includes(next.status)) {
    fieldErrors.status = "Select a valid status.";
  }

  if (!next.startDate) {
    fieldErrors.startDate = "Start date is required.";
  }

  if (!next.planId) {
    fieldErrors.planId = "Plan is required.";
  }

  if (next.templateIds.length === 0) {
    fieldErrors.templateIds = "Select at least one class assignment.";
  }

  if (values.endDate && !next.endDate) {
    fieldErrors.endDate = "Use YYYY-MM-DD.";
  }

  if (values.paidThroughDate && !next.paidThroughDate) {
    fieldErrors.paidThroughDate = "Use YYYY-MM-DD.";
  }

  if (values.cancelledAt && !next.cancelledAt) {
    fieldErrors.cancelledAt = "Use YYYY-MM-DD.";
  }

  if (next.status === "CANCELLED" && !next.cancelledAt) {
    fieldErrors.cancelledAt = "Cancelled date is required when status is CANCELLED.";
  }

  const startDate = next.startDate ? parseDateKey(next.startDate) : null;
  const endDate = next.endDate ? parseDateKey(next.endDate) : null;
  const paidThroughDate = next.paidThroughDate ? parseDateKey(next.paidThroughDate) : null;

  if (startDate && endDate && endDate < startDate) {
    fieldErrors.endDate = "End date must be on or after start date.";
  }

  if (startDate && paidThroughDate && paidThroughDate < startDate) {
    fieldErrors.paidThroughDate = "Paid-through date cannot be before start date.";
  }

  if (endDate && paidThroughDate && paidThroughDate > endDate) {
    fieldErrors.paidThroughDate = "Paid-through date cannot be after end date.";
  }

  return fieldErrors;
}

function formatDateForDiff(value: string) {
  return value || "—";
}

function formatTime(value: number | null) {
  if (typeof value !== "number") return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  const meridiem = hours >= 12 ? "PM" : "AM";
  const baseHour = hours % 12 || 12;
  return `${baseHour}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function formatTemplateLabel(template: EnrolmentTemplateSummary) {
  const name = template.name ?? "Unnamed class";
  const dayLabel = typeof template.dayOfWeek === "number" ? DAY_NAMES[template.dayOfWeek] ?? "Day" : "Day";
  const start = formatTime(template.startTime);
  const end = formatTime(template.endTime);
  const time = start && end ? `${start}-${end}` : start || end;
  return time ? `${name} (${dayLabel} ${time})` : `${name} (${dayLabel})`;
}

function formatTemplateIdsForDiff(templateIds: string[], templatesById: Map<string, EnrolmentTemplateSummary>) {
  if (!templateIds.length) return "—";
  return templateIds
    .map((id) => templatesById.get(id))
    .filter((template): template is EnrolmentTemplateSummary => Boolean(template))
    .map((template) => formatTemplateLabel(template))
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
}

function valueForDiff(params: {
  field: keyof EnrolmentEditFormValues;
  values: EnrolmentEditFormValues;
  plansById: Map<string, EnrolmentPlanSummary>;
  templatesById: Map<string, EnrolmentTemplateSummary>;
}) {
  const { field, values, plansById, templatesById } = params;

  if (field === "planId") {
    if (!values.planId) return "—";
    return plansById.get(values.planId)?.name ?? values.planId;
  }

  if (field === "templateIds") {
    return formatTemplateIdsForDiff(values.templateIds, templatesById);
  }

  if (field === "isBillingPrimary") {
    return values.isBillingPrimary ? "Yes" : "No";
  }

  if (field === "startDate" || field === "endDate" || field === "paidThroughDate" || field === "cancelledAt") {
    return formatDateForDiff(values[field]);
  }

  const value = values[field];
  if (typeof value === "string") {
    return value || "—";
  }

  return String(value);
}

export function buildEnrolmentDiff(params: {
  initialValues: EnrolmentEditFormValues;
  nextValues: EnrolmentEditFormValues;
  plans: EnrolmentPlanSummary[];
  classTemplates: EnrolmentTemplateSummary[];
}) {
  const initial = normalizeEnrolmentFormValues(params.initialValues);
  const next = normalizeEnrolmentFormValues(params.nextValues);

  const plansById = new Map(params.plans.map((plan) => [plan.id, plan]));
  const templatesById = new Map(params.classTemplates.map((template) => [template.id, template]));

  const fields: Array<keyof EnrolmentEditFormValues> = [
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

  return fields
    .map((field) => {
      const before = valueForDiff({ field, values: initial, plansById, templatesById });
      const after = valueForDiff({ field, values: next, plansById, templatesById });
      if (before === after) return null;
      return {
        field,
        label: DIFF_LABELS[field],
        before,
        after,
      } as EnrolmentDiffRow;
    })
    .filter((entry): entry is EnrolmentDiffRow => Boolean(entry));
}
