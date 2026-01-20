import {
  BillingType,
  EnrolmentCreditEventType,
  InvoiceKind,
  InvoiceLineItemKind,
  InvoiceStatus,
  type Prisma,
  type PrismaClient,
  type EnrolmentPlan
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";
import { asDate, normalizeDate } from "@/server/invoicing/dateUtils";
import { assertPlanMatchesTemplate } from "@/server/enrolment/planCompatibility";
import { computeCoverageEndDay } from "@/server/billing/coverageEngine";
import { recalculateEnrolmentCoverage } from "@/server/billing/recalculateEnrolmentCoverage";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { computeBlockCoverageRange } from "@/server/billing/paidThroughDate";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { getWeeklyPaidThrough } from "@/server/billing/enrolmentBilling";
import {
  resolveBlockCatchUpCoverage,
  resolveWeeklyCatchUpCoverage,
} from "@/server/billing/catchUpPaymentUtils";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    enrolment: {
      include: {
        plan: true;
        template: { select: { id: true, dayOfWeek: true, name: true, startTime: true, levelId: true } };
        classAssignments: { include: { template: { select: { id: true, dayOfWeek: true, name: true, startTime: true, levelId: true } } } };
      };
    };
    lineItems: { select: { kind: true; quantity: true; enrolmentId: true; planId: true; blocksBilled: true; billingType: true } };
  };
}>;

type ApplyOptions = {
  client?: PrismaClientOrTx;
  invoice?: InvoiceWithRelations | null;
};

function getClient(client?: PrismaClientOrTx) {
  return client ?? prisma;
}

export function resolveCreditsPurchased(invoice: InvoiceWithRelations, plan: EnrolmentPlan) {
  const enrolmentLines = invoice.lineItems.filter((li) => li.kind === InvoiceLineItemKind.ENROLMENT);
  const quantity = enrolmentLines.reduce((sum, li) => sum + (li.quantity ?? 1), 0) || 1;
  if (plan.billingType === BillingType.PER_WEEK) return 0;
  const blockClassCount = plan.blockClassCount ?? 1;
  if (blockClassCount <= 0) {
    throw new Error("PER_CLASS plans require blockClassCount to grant credits.");
  }
  const computed = blockClassCount * quantity;
  if (invoice.creditsPurchased && invoice.creditsPurchased > 0) {
    return invoice.creditsPurchased < computed ? computed : invoice.creditsPurchased;
  }
  return computed;
}

function resolveEnrolmentQuantity(invoice: InvoiceWithRelations) {
  const enrolmentLines = invoice.lineItems.filter((li) => li.kind === InvoiceLineItemKind.ENROLMENT);
  return enrolmentLines.reduce((sum, li) => sum + (li.quantity ?? 1), 0) || 1;
}

export function normalizeCoverageEndForStorage(value: Date) {
  const dayKey = toBrisbaneDayKey(value);
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function hasAppliedEntitlements(invoice: { entitlementsAppliedAt: Date | null }) {
  return Boolean(invoice.entitlementsAppliedAt);
}

async function recordCreditPurchase(
  tx: Prisma.TransactionClient,
  params: { enrolmentId: string; creditsDelta: number; occurredOn: Date; invoiceId: string }
) {
  await tx.enrolmentCreditEvent.create({
    data: {
      enrolmentId: params.enrolmentId,
      type: EnrolmentCreditEventType.PURCHASE,
      creditsDelta: params.creditsDelta,
      occurredOn: normalizeDate(params.occurredOn),
      note: "Invoice paid",
      invoiceId: params.invoiceId,
    },
  });

  const aggregate = await tx.enrolmentCreditEvent.aggregate({
    where: { enrolmentId: params.enrolmentId },
    _sum: { creditsDelta: true },
  });
  const balance = aggregate._sum.creditsDelta ?? 0;

  await tx.enrolment.update({
    where: { id: params.enrolmentId },
    data: { creditsBalanceCached: balance, creditsRemaining: balance },
  });
}

export async function applyPaidInvoiceToEnrolment(invoiceId: string, options?: ApplyOptions) {
  const client = getClient(options?.client);

  const run = async (tx: Prisma.TransactionClient) => {
    const invoice =
      options?.invoice ??
      (await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          enrolment: { include: { plan: true, template: true, classAssignments: { include: { template: true } } } },
          lineItems: { select: { kind: true, quantity: true, enrolmentId: true, planId: true, blocksBilled: true, billingType: true } },
        },
      }));

    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== InvoiceStatus.PAID) return invoice;
    if (hasAppliedEntitlements(invoice)) return invoice;

    if (invoice.kind === InvoiceKind.CATCH_UP) {
      const enrolmentLines = invoice.lineItems.filter((li) => li.kind === InvoiceLineItemKind.ENROLMENT && li.enrolmentId);
      for (const lineItem of enrolmentLines) {
        if (!lineItem.enrolmentId) continue;
        const enrolment = await tx.enrolment.findUnique({
          where: { id: lineItem.enrolmentId },
          include: {
            plan: true,
            template: true,
            classAssignments: { include: { template: true } },
          },
        });

        if (!enrolment?.plan) continue;
        if (lineItem.planId && enrolment.planId !== lineItem.planId) {
          throw new Error("Catch-up line item plan does not match current enrolment plan.");
        }

        const plan = enrolment.plan;
        const blocksBilled = lineItem.blocksBilled ?? lineItem.quantity ?? 0;
        if (blocksBilled <= 0) continue;

        const assignedTemplates = enrolment.classAssignments.length
          ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
          : enrolment.template
            ? [enrolment.template]
            : [];

        if (!assignedTemplates.length) {
          throw new Error("Class template missing for enrolment.");
        }

        if (plan.billingType === BillingType.PER_WEEK) {
          if (!plan.durationWeeks || plan.durationWeeks <= 0) {
            throw new Error("Weekly plans require a duration in weeks.");
          }

          const templateIds = assignedTemplates.map((template) => template.id);
          const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
          const holidays = await tx.holiday.findMany({
            where: buildHolidayScopeWhere({ templateIds, levelIds }),
            select: { startDate: true, endDate: true, levelId: true, templateId: true },
          });

          const paidThrough = getWeeklyPaidThrough(enrolment);
          const coverage = resolveWeeklyCatchUpCoverage(
            {
              enrolmentStartDate: enrolment.startDate,
              enrolmentEndDate: enrolment.endDate ?? null,
              paidThroughDate: paidThrough ?? null,
              durationWeeks: plan.durationWeeks,
              sessionsPerWeek: plan.sessionsPerWeek ?? null,
              assignedTemplates,
              holidays,
            },
            blocksBilled
          );

          if (!coverage.coverageEnd || !coverage.coverageStart) {
            throw new Error("Weekly catch-up invoices must include a coverage window.");
          }

          await tx.enrolment.update({
            where: { id: enrolment.id },
            data: {
              paidThroughDate: normalizeDate(coverage.coverageEnd),
              paidThroughDateComputed: coverage.coverageEndBase ? normalizeDate(coverage.coverageEndBase) : null,
            },
          });
        } else if (plan.billingType === BillingType.PER_CLASS) {
          if ((plan.blockClassCount ?? 1) <= 0) {
            throw new Error("PER_CLASS plans require blockClassCount to grant credits.");
          }

          const creditsDelta = (plan.blockClassCount ?? 1) * blocksBilled;
          if (creditsDelta > 0) {
            await recordCreditPurchase(tx, {
              enrolmentId: enrolment.id,
              creditsDelta,
              occurredOn: asDate(invoice.paidAt) ?? new Date(),
              invoiceId: invoice.id,
            });
          }

          const anchorTemplate = assignedTemplates.find((template) => template.dayOfWeek != null) ?? enrolment.template;
          if (!anchorTemplate?.dayOfWeek && anchorTemplate?.dayOfWeek !== 0) {
            throw new Error("Class template missing for enrolment.");
          }

          const templateIds = assignedTemplates.map((template) => template.id);
          const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
          const holidays = await tx.holiday.findMany({
            where: buildHolidayScopeWhere({ templateIds, levelIds }),
            select: { startDate: true, endDate: true, levelId: true, templateId: true },
          });

          const coverage = resolveBlockCatchUpCoverage(
            {
              enrolmentStartDate: enrolment.startDate,
              enrolmentEndDate: enrolment.endDate ?? null,
              paidThroughDate: enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null,
              classTemplate: {
                dayOfWeek: anchorTemplate.dayOfWeek,
                startTime: anchorTemplate.startTime ?? null,
              },
              blockClassCount: plan.blockClassCount ?? 1,
              holidays,
            },
            blocksBilled
          );

          if (coverage.coverageEnd) {
            const coverageEnd = normalizeCoverageEndForStorage(coverage.coverageEnd);
            const coverageEndBase = coverage.coverageEndBase
              ? normalizeCoverageEndForStorage(coverage.coverageEndBase)
              : coverageEnd;
            await tx.enrolment.update({
              where: { id: enrolment.id },
              data: {
                paidThroughDate: coverageEnd,
                paidThroughDateComputed: coverageEndBase,
              },
            });
          }
        }

        await recalculateEnrolmentCoverage(enrolment.id, "INVOICE_APPLIED", { tx, actorId: undefined });
        await getEnrolmentBillingStatus(enrolment.id, { client: tx });
      }

      return tx.invoice.update({
        where: { id: invoice.id },
        data: { entitlementsAppliedAt: new Date() },
      });
    }

    const enrolment = invoice.enrolment;
    if (!enrolment?.plan) return invoice;
    if (!enrolment.template) {
      throw new Error("Class template missing for enrolment.");
    }
    assertPlanMatchesTemplate(enrolment.plan, enrolment.template);

    const hasEnrolmentLineItem = invoice.lineItems.some((li) => li.kind === InvoiceLineItemKind.ENROLMENT);
    if (!hasEnrolmentLineItem) return invoice;

    const plan = enrolment.plan;
    const updates: Prisma.EnrolmentUpdateInput = {};
    const paidAt = asDate(invoice.paidAt) ?? new Date();

    if (plan.billingType === BillingType.PER_WEEK) {
      const coverageEnd = invoice.coverageEnd ? normalizeDate(invoice.coverageEnd) : null;
      const coverageStart = invoice.coverageStart ? normalizeDate(invoice.coverageStart) : null;
      if (!coverageEnd) {
        throw new Error("Weekly invoices must include a coverage end date.");
      }
      if (!coverageStart) {
        throw new Error("Weekly invoices must include a coverage start date.");
      }
      const assignedTemplates = enrolment.classAssignments.length
        ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
        : enrolment.template
          ? [enrolment.template]
          : [];
      const entitlementSessions =
        (plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1) *
        (plan.durationWeeks && plan.durationWeeks > 0 ? plan.durationWeeks : 1) *
        resolveEnrolmentQuantity(invoice);
      const baseCoverageEndDayKey = computeCoverageEndDay({
        startDayKey: toBrisbaneDayKey(coverageStart),
        assignedTemplates,
        holidays: [],
        entitlementSessions,
        endDayKey: enrolment.endDate ? toBrisbaneDayKey(enrolment.endDate) : null,
      });
      updates.paidThroughDateComputed = baseCoverageEndDayKey
        ? brisbaneStartOfDay(baseCoverageEndDayKey)
        : null;
      updates.paidThroughDate = coverageEnd;
    } else {
      const creditsDelta = resolveCreditsPurchased(invoice, plan);
      if (creditsDelta > 0) {
        await recordCreditPurchase(tx, {
          enrolmentId: enrolment.id,
          creditsDelta,
          occurredOn: paidAt,
          invoiceId: invoice.id,
        });
      }

      const assignedTemplates = enrolment.classAssignments.length
        ? enrolment.classAssignments.map((assignment) => assignment.template).filter(Boolean)
        : enrolment.template
          ? [enrolment.template]
          : [];
      const anchorTemplate = assignedTemplates.find((template) => template.dayOfWeek != null) ?? enrolment.template;
      if (!anchorTemplate?.dayOfWeek && anchorTemplate?.dayOfWeek !== 0) {
        throw new Error("Class template missing for enrolment.");
      }

      const templateIds = assignedTemplates.map((template) => template.id);
      const levelIds = assignedTemplates.map((template) => template.levelId ?? null);
      const holidays = await tx.holiday.findMany({
        where: buildHolidayScopeWhere({ templateIds, levelIds }),
        select: { startDate: true, endDate: true, levelId: true, templateId: true },
      });
      const coverageRange = computeBlockCoverageRange({
        currentPaidThroughDate: enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null,
        enrolmentStartDate: enrolment.startDate,
        enrolmentEndDate: enrolment.endDate ?? null,
        classTemplate: {
          dayOfWeek: anchorTemplate.dayOfWeek,
          startTime: anchorTemplate.startTime ?? null,
        },
        blockClassCount: plan.blockClassCount ?? 1,
        creditsPurchased: creditsDelta,
        holidays,
      });

      if (coverageRange.coverageEnd) {
        const coverageEnd = normalizeCoverageEndForStorage(coverageRange.coverageEnd);
        const coverageEndBase = coverageRange.coverageEndBase
          ? normalizeCoverageEndForStorage(coverageRange.coverageEndBase)
          : coverageEnd;
        updates.paidThroughDate = coverageEnd;
        updates.paidThroughDateComputed = coverageEndBase;
      }
    }

    if (Object.keys(updates).length > 0) {
      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: updates,
      });
    }

    await recalculateEnrolmentCoverage(enrolment.id, "INVOICE_APPLIED", { tx, actorId: undefined });

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { entitlementsAppliedAt: new Date() },
    });

    await getEnrolmentBillingStatus(enrolment.id, { client: tx });

    return updatedInvoice;
  };

  if (typeof (client as PrismaClient).$transaction === "function") {
    return (client as PrismaClient).$transaction((tx) => run(tx));
  }
  return run(client as Prisma.TransactionClient);
}
