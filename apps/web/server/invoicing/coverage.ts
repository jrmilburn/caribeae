import { BillingType, type Prisma } from "@prisma/client";

import {
  computeCoverageEndDay,
  dayKeyToDate,
  nextScheduledDayKey,
} from "@/server/billing/coverageEngine";
import { computeBlockCoverageRange } from "@/server/billing/paidThroughDate";
import {
  brisbaneAddDays,
  brisbaneCompare,
  toBrisbaneDayKey,
} from "@/server/dates/brisbaneDay";
import { resolveBlockLength } from "@/lib/billing/blockPricing";

export const enrolmentWithPlanInclude = {
  include: {
    plan: true,
    student: { select: { familyId: true } },
    template: { select: { id: true, dayOfWeek: true, name: true, startTime: true, levelId: true } },
    classAssignments: {
      include: {
        template: { select: { id: true, dayOfWeek: true, name: true, startTime: true, levelId: true } },
      },
    },
  },
} satisfies Prisma.EnrolmentDefaultArgs;

// -----------------------------------------------------------------------------
// Types derived from the Prisma include (source of truth for template shape)
// -----------------------------------------------------------------------------
type EnrolmentWithPlan = Prisma.EnrolmentGetPayload<typeof enrolmentWithPlanInclude>;
type TemplateSelected = NonNullable<EnrolmentWithPlan["template"]>;
type AssignedTemplate = EnrolmentWithPlan["template"] | null;

function resolveAssignedTemplates(
  enrolment: Pick<EnrolmentWithPlan, "template" | "classAssignments">
): TemplateSelected[] {
  if (enrolment.classAssignments.length) {
    return enrolment.classAssignments
      .map((assignment) => assignment.template)
      .filter((template): template is NonNullable<typeof template> => Boolean(template));
  }
  return enrolment.template ? [enrolment.template] : [];
}

function limitWeeklyTemplates<T extends { dayOfWeek: number | null | undefined }>(
  templates: T[],
  sessionsPerWeek: number
) {
  if (!sessionsPerWeek || sessionsPerWeek <= 0) return templates;

  const seen = new Set<number>();
  const unique = templates.filter((template) => {
    if (template.dayOfWeek == null) return false;
    if (seen.has(template.dayOfWeek)) return false;
    seen.add(template.dayOfWeek);
    return true;
  });

  if (unique.length <= sessionsPerWeek) return unique;

  return [...unique]
    .sort((a, b) => (a.dayOfWeek ?? 7) - (b.dayOfWeek ?? 7))
    .slice(0, sessionsPerWeek);
}

function resolveCoverageStartDayKey(params: {
  enrolmentStart: Date;
  paidThroughDate: Date | null;
  today: Date;
  assignedTemplates: { dayOfWeek: number | null }[];
  holidays: { startDate: Date; endDate: Date }[];
  enrolmentEndDayKey: string | null;
}) {
  const enrolmentStartDayKey = toBrisbaneDayKey(params.enrolmentStart);
  const todayDayKey = toBrisbaneDayKey(params.today);

  const baseline = params.paidThroughDate
    ? brisbaneAddDays(toBrisbaneDayKey(params.paidThroughDate), 1)
    : enrolmentStartDayKey;

  const candidate = brisbaneCompare(todayDayKey, baseline) > 0 ? todayDayKey : baseline;

  return nextScheduledDayKey({
    startDayKey: candidate,
    assignedTemplates: params.assignedTemplates,
    holidays: params.holidays,
    endDayKey: params.enrolmentEndDayKey,
  });
}

export function resolveWeeklyCoverageWindow(params: {
  enrolment: { startDate: Date; endDate: Date | null; paidThroughDate: Date | null };
  plan: { durationWeeks: number | null; sessionsPerWeek: number | null };
  assignedTemplates: { dayOfWeek: number | null }[];
  holidays: { startDate: Date; endDate: Date }[];
  today?: Date;
}) {
  const durationWeeks = params.plan.durationWeeks;
  if (!durationWeeks || durationWeeks <= 0) {
    throw new Error("Weekly plans require durationWeeks to be greater than zero.");
  }

  const sessionsPerWeek =
    params.plan.sessionsPerWeek && params.plan.sessionsPerWeek > 0
      ? params.plan.sessionsPerWeek
      : 1;

  const entitlementSessions = durationWeeks * sessionsPerWeek;
  const effectiveTemplates = limitWeeklyTemplates(params.assignedTemplates, sessionsPerWeek);

  const today = params.today ?? new Date();
  const enrolmentEndDayKey = params.enrolment.endDate
    ? toBrisbaneDayKey(params.enrolment.endDate)
    : null;

  const coverageStartDayKey = resolveCoverageStartDayKey({
    enrolmentStart: params.enrolment.startDate,
    paidThroughDate: params.enrolment.paidThroughDate,
    today,
    assignedTemplates: effectiveTemplates,
    holidays: params.holidays,
    enrolmentEndDayKey,
  });

  if (!coverageStartDayKey) {
    return {
      coverageStart: null as Date | null,
      coverageEnd: null as Date | null,
      coverageEndBase: null as Date | null,
    };
  }

  const coverageEndDayKey = computeCoverageEndDay({
    startDayKey: coverageStartDayKey,
    assignedTemplates: effectiveTemplates,
    holidays: params.holidays,
    entitlementSessions,
    endDayKey: enrolmentEndDayKey,
  });

  const coverageEndBaseDayKey = computeCoverageEndDay({
    startDayKey: coverageStartDayKey,
    assignedTemplates: effectiveTemplates,
    holidays: [],
    entitlementSessions,
    endDayKey: enrolmentEndDayKey,
  });

  return {
    coverageStart: dayKeyToDate(coverageStartDayKey),
    coverageEnd: dayKeyToDate(coverageEndDayKey),
    coverageEndBase: dayKeyToDate(coverageEndBaseDayKey),
  };
}

export function resolveWeeklyPayAheadSequence(params: {
  startDate: Date;
  endDate: Date | null;
  paidThroughDate: Date | null;
  durationWeeks: number;
  sessionsPerWeek: number | null;
  quantity: number;
  assignedTemplates: { dayOfWeek: number | null }[];
  holidays: { startDate: Date; endDate: Date }[];
  today?: Date;
}) {
  if (!params.durationWeeks || params.durationWeeks <= 0) {
    throw new Error("Weekly plans require durationWeeks to be greater than zero.");
  }
  if (params.quantity <= 0) {
    return { coverageStart: null as Date | null, coverageEnd: null as Date | null, periods: 0 };
  }

  const today = params.today ?? new Date();
  const endDayKey = params.endDate ? toBrisbaneDayKey(params.endDate) : null;

  const sessionsPerWeek =
    params.sessionsPerWeek && params.sessionsPerWeek > 0 ? params.sessionsPerWeek : 1;

  const entitlementSessions = params.durationWeeks * sessionsPerWeek;
  const effectiveTemplates = limitWeeklyTemplates(params.assignedTemplates, sessionsPerWeek);

  const firstStartDayKey = resolveCoverageStartDayKey({
    enrolmentStart: params.startDate,
    paidThroughDate: params.paidThroughDate,
    today,
    assignedTemplates: effectiveTemplates,
    holidays: params.holidays,
    enrolmentEndDayKey: endDayKey,
  });

  if (!firstStartDayKey) {
    return { coverageStart: null, coverageEnd: null, periods: 0 };
  }

  let currentStart = firstStartDayKey;
  let coverageEndDayKey = firstStartDayKey;
  let periods = 0;

  for (let i = 0; i < params.quantity; i += 1) {
    const endKey = computeCoverageEndDay({
      startDayKey: currentStart,
      assignedTemplates: effectiveTemplates,
      holidays: params.holidays,
      entitlementSessions,
      endDayKey,
    });

    if (!endKey) break;

    coverageEndDayKey = endKey;
    periods += 1;

    const nextStartCandidate = brisbaneAddDays(endKey, 1);
    const nextStart = nextScheduledDayKey({
      startDayKey: nextStartCandidate,
      assignedTemplates: effectiveTemplates,
      holidays: params.holidays,
      endDayKey,
    });

    if (!nextStart) break;
    currentStart = nextStart;
  }

  return {
    coverageStart: dayKeyToDate(firstStartDayKey),
    coverageEnd: dayKeyToDate(coverageEndDayKey),
    periods,
  };
}

export function resolveCoverageForPlan(params: {
  enrolment: EnrolmentWithPlan;
  plan: Prisma.EnrolmentPlanUncheckedCreateInput | Prisma.EnrolmentPlanGetPayload<{ include: { level: true } }>;
  holidays: { startDate: Date; endDate: Date }[];
  today?: Date;
  customBlockLength?: number | null;
}) {
  const { enrolment, plan } = params;
  const today = params.today ?? new Date();

  if (plan.billingType === BillingType.PER_WEEK) {
    const assignedTemplates = resolveAssignedTemplates(enrolment);

    const sessionsPerWeek =
      plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;

    const { coverageStart, coverageEnd, coverageEndBase } = resolveWeeklyCoverageWindow({
      enrolment: {
        startDate: enrolment.startDate,
        endDate: enrolment.endDate,
        paidThroughDate: enrolment.paidThroughDate,
      },
      plan: { durationWeeks: plan.durationWeeks ?? null, sessionsPerWeek },
      assignedTemplates: limitWeeklyTemplates(assignedTemplates, sessionsPerWeek),
      holidays: params.holidays,
      today,
    });

    return { coverageStart, coverageEnd, coverageEndBase, creditsPurchased: null };
  }

  const planBlockLength = resolveBlockLength(plan.blockClassCount ?? null);
  if (plan.blockClassCount != null && plan.blockClassCount <= 0) {
    throw new Error("PER_CLASS plans with blockClassCount must be > 0.");
  }
  if (params.customBlockLength != null) {
    if (!Number.isInteger(params.customBlockLength)) {
      throw new Error("Custom block length must be an integer.");
    }
    if (params.customBlockLength < planBlockLength) {
      throw new Error("Custom block length must be at least the plan block length.");
    }
  }
  const creditsPurchased = params.customBlockLength ?? planBlockLength;

  const assignedTemplates = resolveAssignedTemplates(enrolment);

  const anchorTemplate: AssignedTemplate =
    assignedTemplates.find((template) => template.dayOfWeek != null) ?? enrolment.template;

  if (!anchorTemplate?.dayOfWeek && anchorTemplate?.dayOfWeek !== 0) {
    return { coverageStart: null, coverageEnd: null, coverageEndBase: null, creditsPurchased };
  }

  const coverageRange = computeBlockCoverageRange({
    currentPaidThroughDate: enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null,
    enrolmentStartDate: enrolment.startDate,
    enrolmentEndDate: enrolment.endDate ?? null,
    classTemplate: {
      dayOfWeek: anchorTemplate.dayOfWeek,
      startTime: anchorTemplate.startTime ?? null,
    },
    assignedTemplates: assignedTemplates.map((template) => ({
      dayOfWeek: template.dayOfWeek,
      startTime: template.startTime ?? null,
    })),
    blockClassCount: planBlockLength,
    blocksPurchased: 1,
    creditsPurchased,
    holidays: params.holidays,
  });

  return {
    coverageStart: coverageRange.coverageStart,
    coverageEnd: coverageRange.coverageEnd,
    coverageEndBase: coverageRange.coverageEndBase,
    creditsPurchased: coverageRange.creditsPurchased,
  };
}
