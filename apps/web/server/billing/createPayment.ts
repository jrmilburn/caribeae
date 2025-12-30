"use server";

import { BillingType, InvoiceStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";

import { adjustInvoicePayment, nextInvoiceStatus } from "./utils";

const allocationSchema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.number().int().positive(),
});

const paymentSchema = z
  .object({
    familyId: z.string().min(1),
    amountCents: z.number().int().positive(),
    paidAt: z.coerce.date().optional(),
    method: z.string().trim().max(100).optional(),
    note: z.string().trim().max(1000).optional(),
    allocations: z.array(allocationSchema).optional(),
    allocationMode: z.enum(["AUTO", "MANUAL"]).optional(),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const mode = data.allocationMode ?? "MANUAL";
    if (mode === "AUTO" || !data.allocations || data.allocations.length === 0) return;
    const allocationTotal = data.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    if (allocationTotal !== data.amountCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation total must equal payment amount.",
        path: ["allocations"],
      });
    }
  });

type Allocation = z.infer<typeof allocationSchema>;
type InvoiceForAllocation = Prisma.InvoiceGetPayload<{
  include: { enrolment: { include: { plan: true } } };
}>;

function aggregateAllocations(allocations: Allocation[]) {
  const aggregated = allocations.reduce<Record<string, number>>((acc, allocation) => {
    acc[allocation.invoiceId] = (acc[allocation.invoiceId] ?? 0) + allocation.amountCents;
    return acc;
  }, {});

  return Object.entries(aggregated).map(([invoiceId, amountCents]) => ({
    invoiceId,
    amountCents,
  }));
}

async function applyAllocationToInvoice(
  tx: Prisma.TransactionClient,
  invoice: InvoiceForAllocation,
  deltaCents: number,
  paidAt: Date
) {
  const nextPaid = Math.max(invoice.amountPaidCents + deltaCents, 0);
  const status = nextInvoiceStatus({
    invoice: {
      status: invoice.status,
      amountCents: invoice.amountCents,
      dueAt: invoice.dueAt,
      issuedAt: invoice.issuedAt,
    },
    paidCents: nextPaid,
  });

  const updated = await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      amountPaidCents: nextPaid,
      status,
      paidAt: status === InvoiceStatus.PAID ? invoice.paidAt ?? paidAt : status === InvoiceStatus.VOID ? invoice.paidAt : null,
    },
  });

  invoice.amountPaidCents = updated.amountPaidCents;
  invoice.status = updated.status;
  invoice.paidAt = updated.paidAt;

  if (status === InvoiceStatus.PAID && invoice.enrolment?.plan) {
    const plan = invoice.enrolment.plan;
    if (plan.billingType === BillingType.PER_WEEK && invoice.coverageEnd) {
      await tx.enrolment.update({
        where: { id: invoice.enrolment.id },
        data: { paidThroughDate: invoice.coverageEnd },
      });
    } else if (
      (plan.billingType === BillingType.BLOCK || plan.billingType === BillingType.PER_CLASS) &&
      invoice.creditsPurchased
    ) {
      await tx.enrolment.update({
        where: { id: invoice.enrolment.id },
        data: {
          creditsRemaining: (invoice.enrolment.creditsRemaining ?? 0) + invoice.creditsPurchased,
        },
      });
    }
  }
}

async function persistAllocations(
  tx: Prisma.TransactionClient,
  params: {
    paymentId: string;
    allocations: Allocation[];
    invoices: InvoiceForAllocation[];
    paidAt: Date;
  }
) {
  const { paymentId, allocations, invoices, paidAt } = params;
  if (allocations.length === 0) return { allocatedCents: 0 };

  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const aggregated = aggregateAllocations(allocations);

  await tx.paymentAllocation.createMany({
    data: aggregated.map((allocation) => ({
      paymentId,
      invoiceId: allocation.invoiceId,
      amountCents: allocation.amountCents,
    })),
  });

  for (const allocation of aggregated) {
    const invoice = invoiceMap.get(allocation.invoiceId);
    if (invoice) {
      await applyAllocationToInvoice(tx, invoice, allocation.amountCents, paidAt);
    } else {
      await adjustInvoicePayment(tx, allocation.invoiceId, allocation.amountCents, paidAt);
    }
  }

  const allocatedCents = aggregated.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  return { allocatedCents };
}

async function validateManualAllocations(
  tx: Prisma.TransactionClient,
  familyId: string,
  allocations: Allocation[]
) {
  if (allocations.length === 0) return { allocations: [] as Allocation[], invoices: [] as InvoiceForAllocation[] };

  const aggregated = aggregateAllocations(allocations);
  const invoiceIds = aggregated.map((a) => a.invoiceId);

  const invoices = await tx.invoice.findMany({
    where: { id: { in: invoiceIds } },
    include: { enrolment: { include: { plan: true } } },
  });

  if (invoices.length !== invoiceIds.length) {
    throw new Error("One or more invoices could not be found.");
  }

  const requestedByInvoice = new Map(aggregated.map((a) => [a.invoiceId, a.amountCents]));

  invoices.forEach((inv) => {
    if (inv.familyId !== familyId) {
      throw new Error("Payment allocations must belong to the same family.");
    }
    if (inv.status === "VOID" || !OPEN_INVOICE_STATUSES.includes(inv.status as (typeof OPEN_INVOICE_STATUSES)[number])) {
      throw new Error("Cannot allocate payments to closed invoices.");
    }
    const requested = requestedByInvoice.get(inv.id) ?? 0;
    const balance = Math.max(inv.amountCents - inv.amountPaidCents, 0);
    if (requested > balance) {
      throw new Error("Allocation exceeds the invoice balance.");
    }
  });

  return { allocations: aggregated, invoices };
}

async function buildAutoAllocations(
  tx: Prisma.TransactionClient,
  familyId: string,
  amountCents: number
) {
  if (amountCents <= 0) return { allocations: [] as Allocation[], invoices: [] as InvoiceForAllocation[] };

  const invoices = await tx.invoice.findMany({
    where: { familyId, status: { in: OPEN_INVOICE_STATUSES } },
    include: { enrolment: { include: { plan: true } } },
    orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }],
  });

  let remaining = amountCents;
  const allocations: Allocation[] = [];

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const balance = Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
    if (balance <= 0) continue;
    const apply = Math.min(balance, remaining);
    allocations.push({ invoiceId: invoice.id, amountCents: apply });
    remaining -= apply;
  }

  return { allocations, invoices };
}

export type CreatePaymentInput = z.infer<typeof paymentSchema>;

export async function createPayment(input: CreatePaymentInput) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = paymentSchema.parse(input);
  const paidAt = payload.paidAt ?? new Date();
  const mode = payload.allocationMode ?? "MANUAL";

  return prisma.$transaction(async (tx) => {
    if (payload.idempotencyKey) {
      const existing = await tx.payment.findFirst({
        where: { familyId: payload.familyId, idempotencyKey: payload.idempotencyKey },
      });
      if (existing) {
        const allocated = await tx.paymentAllocation.aggregate({
          where: { paymentId: existing.id },
          _sum: { amountCents: true },
        });
        const allocatedCents = allocated._sum.amountCents ?? 0;
        return {
          payment: existing,
          allocations: [] as Allocation[],
          allocatedCents,
          unallocatedCents: Math.max(existing.amountCents - allocatedCents, 0),
        };
      }
    }

    const payment = await tx.payment.create({
      data: {
        familyId: payload.familyId,
        amountCents: payload.amountCents,
        paidAt,
        method: payload.method?.trim() || undefined,
        note: payload.note?.trim() || undefined,
        idempotencyKey: payload.idempotencyKey ?? null,
      },
    });

    let allocations: Allocation[] = [];
    let invoices: InvoiceForAllocation[] = [];

    if (mode === "AUTO") {
      const auto = await buildAutoAllocations(tx, payload.familyId, payload.amountCents);
      allocations = auto.allocations;
      invoices = auto.invoices;
    } else if (payload.allocations?.length) {
      const manual = await validateManualAllocations(tx, payload.familyId, payload.allocations);
      allocations = manual.allocations;
      invoices = manual.invoices;
    }

    const { allocatedCents } = await persistAllocations(tx, {
      paymentId: payment.id,
      allocations,
      invoices,
      paidAt,
    });

    return {
      payment,
      allocations,
      allocatedCents,
      unallocatedCents: Math.max(payload.amountCents - allocatedCents, 0),
    };
  });
}

export async function autoAllocatePayment(paymentId: string) {
  await getOrCreateUser();
  await requireAdmin();

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: true },
    });

    if (!payment) throw new Error("Payment not found.");

    const alreadyAllocated = payment.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    const remaining = payment.amountCents - alreadyAllocated;
    if (remaining <= 0) {
      return { payment, allocations: [] as Allocation[], allocatedCents: 0, unallocatedCents: 0 };
    }

    const auto = await buildAutoAllocations(tx, payment.familyId, remaining);
    const { allocatedCents } = await persistAllocations(tx, {
      paymentId,
      allocations: auto.allocations,
      invoices: auto.invoices,
      paidAt: payment.paidAt ?? new Date(),
    });

    return {
      payment,
      allocations: auto.allocations,
      allocatedCents,
      unallocatedCents: Math.max(payment.amountCents - (alreadyAllocated + allocatedCents), 0),
    };
  });
}
