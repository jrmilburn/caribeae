"use server";

import { addDays } from "date-fns";
import {
  BillingType,
  EnrolmentStatus,
  InvoiceKind,
  InvoiceLineItemKind,
  InvoiceStatus,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { formatCurrencyFromCents } from "@/lib/currency";
import { calculateBlockPricing, resolveBlockLength } from "@/lib/billing/blockPricing";
import { normalizeDate } from "@/server/invoicing/dateUtils";
import { getBillingStatusForEnrolments, getWeeklyPaidThrough } from "@/server/billing/enrolmentBilling";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { OPEN_INVOICE_STATUSES, DEFAULT_DUE_IN_DAYS } from "@/server/invoicing/constants";
import { createInvoiceWithLineItems, createPaymentAndAllocate } from "@/server/billing/invoiceMutations";
import {
  resolveBlockBlocksToCurrent,
  resolveBlockCatchUpCoverage,
  resolveWeeklyBlocksToCurrent,
  resolveWeeklyCatchUpCoverage,
} from "@/server/billing/catchUpPaymentUtils";
import { brisbaneCompare, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

const payAheadSchema = z
  .number()
  .int()
  .refine((value) => value === 0 || value === 1, {
    message: "Pay ahead is capped to one block (0 or 1).",
  })
  .default(0);

const previewSchema = z.object({
  familyId: z.string().min(1),
  payAheadBlocks: payAheadSchema,
});

const createSchema = z.object({
  familyId: z.string().min(1),
  payAheadBlocks: payAheadSchema,
  method: z.string().trim().max(100).optional(),
  note: z.string().trim().max(1000).optional(),
  paidAt: z.coerce.date().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

export type CatchUpPreviewRow = {
  enrolmentId: string;
  studentName: string;
  planId: string;
  planName: string;
  billingType: BillingType;
  requiredBlocksToCurrent: number;
  blocksBilled: number;
  blockClassCount: number | null;
  fromPaidThroughDate: Date | null;
  fromCreditsRemaining: number | null;
  toPaidThroughDate: Date | null;
  toCreditsRemaining: number | null;
  unitPriceCents: number;
  amountCents: number;
};

export type CatchUpPreview = {
  familyId: string;
  payAheadBlocks: number;
  rows: CatchUpPreviewRow[];
  totalCents: number;
  warnings: string[];
};

const LARGE_BLOCK_THRESHOLD = 6;
const LARGE_AMOUNT_THRESHOLD_CENTS = 500_00;

function formatWarning(totalCents: number, totalBlocks: number) {
  if (totalBlocks >= LARGE_BLOCK_THRESHOLD || totalCents >= LARGE_AMOUNT_THRESHOLD_CENTS) {
    return `Large catch-up detected: ${totalBlocks} blocks / ${formatCurrencyFromCents(totalCents)}.`;
  }
  return null;
}

async function loadHolidays(
  tx: Prisma.TransactionClient,
  params: { templateIds: string[]; levelIds: Array<string | null> }
) {
  if (!params.templateIds.length) return [];
  return tx.holiday.findMany({
    where: buildHolidayScopeWhere({ templateIds: params.templateIds, levelIds: params.levelIds }),
    select: { startDate: true, endDate: true, levelId: true, templateId: true },
  });
}

async function buildCatchUpPreview(
  tx: Prisma.TransactionClient,
  params: { familyId: string; payAheadBlocks: number }
): Promise<CatchUpPreview> {
  const enrolments = await tx.enrolment.findMany({
    where: {
      status: EnrolmentStatus.ACTIVE,
      isBillingPrimary: true,
      student: { familyId: params.familyId },
    },
    include: {
      plan: true,
      student: { select: { name: true, familyId: true } },
      template: { select: { id: true, dayOfWeek: true, startTime: true, levelId: true } },
      classAssignments: {
        include: { template: { select: { id: true, dayOfWeek: true, startTime: true, levelId: true } } },
      },
    },
  });

  if (!enrolments.length) {
    return { familyId: params.familyId, payAheadBlocks: params.payAheadBlocks, rows: [], totalCents: 0, warnings: [] };
  }

  const familyId = enrolments[0]?.student.familyId;
  if (familyId !== params.familyId || enrolments.some((enrolment) => enrolment.student.familyId !== params.familyId)) {
    throw new Error("Selected enrolments must belong to the same family.");
  }

  const statusMap = await getBillingStatusForEnrolments(
    enrolments.map((enrolment) => enrolment.id),
    { client: tx }
  );

  const today = brisbaneStartOfDay(new Date());
  const rows: CatchUpPreviewRow[] = [];

  for (const enrolment of enrolments) {
    if (!enrolment.plan) throw new Error("Enrolment plan missing.");
    if (!enrolment.template && enrolment.classAssignments.length === 0) {
      throw new Error("Class template missing for enrolment.");
    }

    const plan = enrolment.plan;
    const snapshot = statusMap.get(enrolment.id);
    const fromPaidThrough =
      plan.billingType === BillingType.PER_WEEK
        ? snapshot?.paidThroughDate ?? getWeeklyPaidThrough(enrolment)
        : snapshot?.paidThroughDate ?? enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null;
    const fromCredits = snapshot?.remainingCredits ?? enrolment.creditsRemaining ?? null;

    if (plan.billingType === BillingType.PER_WEEK) {
      if (!plan.durationWeeks || plan.durationWeeks <= 0) {
        throw new Error("Weekly plans require a duration in weeks.");
      }

      const assignedTemplates = enrolment.classAssignments.length
        ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
        : enrolment.template
          ? [enrolment.template]
          : [];
      if (!assignedTemplates.length) {
        throw new Error("Class template missing for enrolment.");
      }

      const templateIds = assignedTemplates.map((template) => template.id);
      const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
      const holidays = await loadHolidays(tx, { templateIds, levelIds });

      const paidThroughKey = fromPaidThrough ? toBrisbaneDayKey(fromPaidThrough) : null;
      const todayKey = toBrisbaneDayKey(today);
      const isCurrent = paidThroughKey && brisbaneCompare(paidThroughKey, todayKey) >= 0;

      const requiredBlocksToCurrent = isCurrent
        ? 0
        : resolveWeeklyBlocksToCurrent(
            {
              enrolmentStartDate: enrolment.startDate,
              enrolmentEndDate: enrolment.endDate ?? null,
              paidThroughDate: fromPaidThrough ?? null,
              durationWeeks: plan.durationWeeks,
              sessionsPerWeek: plan.sessionsPerWeek ?? null,
              assignedTemplates,
              holidays,
            },
            today
          );

      const blocksBilled = requiredBlocksToCurrent + params.payAheadBlocks;
      if (blocksBilled <= 0) continue;

      const coverage = resolveWeeklyCatchUpCoverage(
        {
          enrolmentStartDate: enrolment.startDate,
          enrolmentEndDate: enrolment.endDate ?? null,
          paidThroughDate: fromPaidThrough ?? null,
          durationWeeks: plan.durationWeeks,
          sessionsPerWeek: plan.sessionsPerWeek ?? null,
          assignedTemplates,
          holidays,
        },
        blocksBilled
      );

      const unitPriceCents = plan.priceCents;
      const amountCents = unitPriceCents * blocksBilled;

      rows.push({
        enrolmentId: enrolment.id,
        studentName: enrolment.student.name,
        planId: plan.id,
        planName: plan.name,
        billingType: plan.billingType,
        requiredBlocksToCurrent,
        blocksBilled,
        blockClassCount: plan.blockClassCount ?? null,
        fromPaidThroughDate: fromPaidThrough ?? null,
        fromCreditsRemaining: null,
        toPaidThroughDate: coverage.coverageEnd ?? fromPaidThrough ?? null,
        toCreditsRemaining: null,
        unitPriceCents,
        amountCents,
      });
      continue;
    }

    const blockClassCount = resolveBlockLength(plan.blockClassCount);
    if (blockClassCount <= 0) {
      throw new Error("PER_CLASS plans require blockClassCount to be greater than zero when provided.");
    }

    const assignedTemplates = enrolment.classAssignments.length
      ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
      : enrolment.template
        ? [enrolment.template]
        : [];
    const anchorTemplate = assignedTemplates.find((template) => template.dayOfWeek != null) ?? enrolment.template;
    if (!anchorTemplate) {
      throw new Error("Class template missing for enrolment.");
    }

    const templateIds = assignedTemplates.map((template) => template.id);
    const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
    const holidays = await loadHolidays(tx, { templateIds, levelIds });

    const requiredBlocksToCurrent = resolveBlockBlocksToCurrent({
      remainingCredits: fromCredits ?? 0,
      paidThroughDate: fromPaidThrough ?? null,
      blockClassCount,
      today,
    });

    const blocksBilled = requiredBlocksToCurrent + params.payAheadBlocks;
    if (blocksBilled <= 0) continue;

    const coverage = resolveBlockCatchUpCoverage(
      {
        enrolmentStartDate: enrolment.startDate,
        enrolmentEndDate: enrolment.endDate ?? null,
        paidThroughDate: fromPaidThrough ?? null,
        classTemplate: { dayOfWeek: anchorTemplate.dayOfWeek ?? null, startTime: anchorTemplate.startTime ?? null },
        assignedTemplates: assignedTemplates.map((template) => ({
          dayOfWeek: template.dayOfWeek,
          startTime: template.startTime ?? null,
        })),
        blockClassCount,
        holidays,
      },
      blocksBilled
    );

    const pricing = calculateBlockPricing({ priceCents: plan.priceCents, blockLength: blockClassCount });
    const unitPriceCents = pricing.totalCents;
    const amountCents = unitPriceCents * blocksBilled;

    rows.push({
      enrolmentId: enrolment.id,
      studentName: enrolment.student.name,
      planId: plan.id,
      planName: plan.name,
      billingType: plan.billingType,
      requiredBlocksToCurrent,
      blocksBilled,
      blockClassCount: plan.blockClassCount ?? null,
      fromPaidThroughDate: fromPaidThrough ?? null,
      fromCreditsRemaining: fromCredits,
      toPaidThroughDate: coverage.coverageEnd ?? fromPaidThrough ?? null,
      toCreditsRemaining: (fromCredits ?? 0) + blockClassCount * blocksBilled,
      unitPriceCents,
      amountCents,
    });
  }

  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const totalBlocks = rows.reduce((sum, row) => sum + row.blocksBilled, 0);
  const warning = formatWarning(totalCents, totalBlocks);

  return {
    familyId: params.familyId,
    payAheadBlocks: params.payAheadBlocks,
    rows,
    totalCents,
    warnings: warning ? [warning] : [],
  };
}

export async function previewCatchUpPayment(familyId: string, payAheadBlocks = 0) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = previewSchema.parse({ familyId, payAheadBlocks });

  return prisma.$transaction(async (tx) => {
    const openInvoice = await tx.invoice.findFirst({
      where: { familyId: payload.familyId, status: { in: [...OPEN_INVOICE_STATUSES] } },
    });
    if (openInvoice) {
      throw new Error("Existing unpaid invoice(s) exist — resolve them first.");
    }
    return buildCatchUpPreview(tx, payload);
  });
}

export async function createCatchUpPayment(input: z.infer<typeof createSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = createSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const openInvoice = await tx.invoice.findFirst({
      where: { familyId: payload.familyId, status: { in: [...OPEN_INVOICE_STATUSES] } },
    });
    if (openInvoice) {
      throw new Error("Existing unpaid invoice(s) exist — resolve them first.");
    }

    const preview = await buildCatchUpPreview(tx, {
      familyId: payload.familyId,
      payAheadBlocks: payload.payAheadBlocks,
    });

    if (preview.totalCents <= 0 || preview.rows.length === 0) {
      throw new Error("Nothing to pay.");
    }

    const issuedAt = new Date();
    const dueAt = addDays(issuedAt, DEFAULT_DUE_IN_DAYS);

    const invoice = await createInvoiceWithLineItems({
      familyId: payload.familyId,
      enrolmentId: null,
      kind: InvoiceKind.CATCH_UP,
      lineItems: preview.rows.map((row) => {
        const blockSizeInfo = row.blockClassCount ? ` · Block size ${row.blockClassCount}` : "";
        return {
          kind: InvoiceLineItemKind.ENROLMENT,
          description: `${row.planName} – catch-up payment (blocks: ${row.blocksBilled})${blockSizeInfo}`,
          quantity: row.blocksBilled,
          unitPriceCents: row.unitPriceCents,
          amountCents: row.amountCents,
          enrolmentId: row.enrolmentId,
          planId: row.planId,
          blocksBilled: row.blocksBilled,
          billingType: row.billingType,
        };
      }),
      status: InvoiceStatus.SENT,
      issuedAt,
      dueAt,
      client: tx,
      skipAuth: true,
    });

    const paymentResult = await createPaymentAndAllocate({
      familyId: payload.familyId,
      amountCents: invoice.amountCents,
      allocations: [{ invoiceId: invoice.id, amountCents: invoice.amountCents }],
      paidAt: normalizeDate(payload.paidAt ?? new Date(), "paidAt"),
      method: payload.method?.trim() || undefined,
      note: payload.note?.trim() || undefined,
      idempotencyKey: payload.idempotencyKey ?? undefined,
      client: tx,
      skipAuth: true,
    });

    return {
      invoiceId: invoice.id,
      paymentId: paymentResult.payment.id,
      totalCents: invoice.amountCents,
    };
  });
}
