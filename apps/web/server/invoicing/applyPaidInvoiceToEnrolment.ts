import { isAfter } from "date-fns";
import {
  BillingType,
  EnrolmentCreditEventType,
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
import { recomputeEnrolmentCoverage } from "@/server/billing/recomputeEnrolmentCoverage";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

type InvoiceWithRelations = Prisma.InvoiceGetPayload<{
  include: {
    enrolment: {
      include: {
        plan: true;
        template: { select: { dayOfWeek: true, name: true } };
        classAssignments: { include: { template: { select: { dayOfWeek: true, name: true } } } };
      };
    };
    lineItems: { select: { kind: true; quantity: true } };
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
          lineItems: { select: { kind: true, quantity: true } },
        },
      }));

    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status !== InvoiceStatus.PAID) return invoice;
    if (hasAppliedEntitlements(invoice)) return invoice;

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

      if (invoice.coverageEnd) {
        const coverageEnd = normalizeCoverageEndForStorage(invoice.coverageEnd);
        updates.paidThroughDate = coverageEnd;
        updates.paidThroughDateComputed = coverageEnd;
      }
    }

    if (Object.keys(updates).length > 0) {
      await tx.enrolment.update({
        where: { id: enrolment.id },
        data: updates,
      });
    }

    if (plan.billingType === BillingType.PER_WEEK) {
      await recomputeEnrolmentCoverage(enrolment.id, "INVOICE_APPLIED", { client: tx });
    }

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
