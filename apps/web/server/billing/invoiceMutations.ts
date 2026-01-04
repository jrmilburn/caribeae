"use server";

import { addDays } from "date-fns";
import type { Prisma, PrismaClient } from "@prisma/client";
import { InvoiceLineItemKind, InvoiceStatus, PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { nextInvoiceStatus } from "./utils";
import { applyPaidInvoiceToEnrolment } from "@/server/invoicing/applyPaidInvoiceToEnrolment";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

type LineItemInput = {
  kind: InvoiceLineItemKind;
  description: string;
  quantity?: number;
  unitPriceCents?: number;
  amountCents?: number;
  productId?: string | null;
  enrolmentId?: string | null;
  studentId?: string | null;
};

type InvoiceWithEntitlement = Prisma.InvoiceGetPayload<{
  include: {
    enrolment: { include: { plan: true } };
    lineItems: { select: { id: true; kind: true } };
  };
}>;

type CreateInvoiceWithLineItemsInput = {
  familyId: string;
  enrolmentId?: string | null;
  lineItems: LineItemInput[];
  issuedAt?: Date;
  dueAt?: Date | null;
  status?: InvoiceStatus;
  coverageStart?: Date | null;
  coverageEnd?: Date | null;
  creditsPurchased?: number | null;
  skipAuth?: boolean;
  client?: PrismaClientOrTx;
};

type ReplaceLineItemsInput = {
  invoiceId: string;
  lineItems: LineItemInput[];
  skipAuth?: boolean;
  client?: PrismaClientOrTx;
};

type PaymentAllocationInput = { invoiceId: string; amountCents: number };

type CreatePaymentAndAllocateInput = {
  familyId: string;
  amountCents: number;
  paidAt?: Date;
  method?: string;
  note?: string;
  allocations?: PaymentAllocationInput[];
  strategy?: "oldest-open-first";
  idempotencyKey?: string;
  skipAuth?: boolean;
  client?: PrismaClientOrTx;
};

type AllocationBuildResult = {
  allocations: PaymentAllocationInput[];
  invoices: InvoiceWithEntitlement[];
};

function getClient(client?: PrismaClientOrTx) {
  return client ?? prisma;
}

async function ensureAdminAccess(skipAuth?: boolean) {
  if (skipAuth) return;
  await getOrCreateUser();
  await requireAdmin();
}

function normalizeLineItem(input: LineItemInput) {
  const quantity = input.quantity && input.quantity > 0 ? Math.trunc(input.quantity) : 1;
  const unitPriceCents = Math.trunc(input.unitPriceCents ?? input.amountCents ?? 0);
  const explicitAmount = input.amountCents ?? null;
  const computed = explicitAmount != null ? explicitAmount : quantity * unitPriceCents;

  return {
    kind: input.kind,
    description: input.description,
    quantity,
    unitPriceCents,
    amountCents: computed,
    productId: input.productId ?? null,
    enrolmentId: input.enrolmentId ?? null,
    studentId: input.studentId ?? null,
  };
}

async function withTransaction<T>(
  client: PrismaClientOrTx | undefined,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
) {
  const candidate = client ?? prisma;
  if (typeof (candidate as PrismaClient).$transaction === "function") {
    return (candidate as PrismaClient).$transaction((tx) => fn(tx));
  }
  return fn(candidate as Prisma.TransactionClient);
}

export async function recalculateInvoiceTotals(
  invoiceId: string,
  options?: { client?: PrismaClientOrTx; skipAuth?: boolean }
) {
  await ensureAdminAccess(options?.skipAuth);
  const client = getClient(options?.client);

  return withTransaction(client, async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        status: true,
        amountPaidCents: true,
        dueAt: true,
        issuedAt: true,
        paidAt: true,
      },
    });
    if (!invoice) throw new Error("Invoice not found");

    const sum = await tx.invoiceLineItem.aggregate({
      where: { invoiceId },
      _sum: { amountCents: true },
    });
    const amountCents = sum._sum.amountCents ?? 0;

    const status =
      invoice.status === InvoiceStatus.VOID
        ? InvoiceStatus.VOID
        : nextInvoiceStatus({
            invoice: {
              status: invoice.status,
              amountCents,
              dueAt: invoice.dueAt,
              issuedAt: invoice.issuedAt,
            },
            paidCents: invoice.amountPaidCents,
          });

    const paidAt =
      status === InvoiceStatus.PAID
        ? invoice.paidAt ?? new Date()
        : status === InvoiceStatus.VOID
          ? invoice.paidAt
          : null;

    return tx.invoice.update({
      where: { id: invoiceId },
      data: { amountCents, status, paidAt },
    });
  });
}

export async function createInvoiceWithLineItems(input: CreateInvoiceWithLineItemsInput) {
  await ensureAdminAccess(input.skipAuth);
  const client = getClient(input.client);

  return withTransaction(client, async (tx) => {
    const issuedAt = input.issuedAt ?? new Date();
    const dueAt = input.dueAt === undefined ? addDays(issuedAt, 7) : input.dueAt;

    const invoice = await tx.invoice.create({
      data: {
        familyId: input.familyId,
        enrolmentId: input.enrolmentId ?? null,
        amountCents: 0,
        amountPaidCents: 0,
        status: input.status ?? InvoiceStatus.DRAFT,
        issuedAt,
        dueAt,
        coverageStart: input.coverageStart ?? null,
        coverageEnd: input.coverageEnd ?? null,
        creditsPurchased: input.creditsPurchased ?? null,
      },
    });

    if (input.lineItems.length) {
      const normalized = input.lineItems.map((item) => normalizeLineItem(item));
      await tx.invoiceLineItem.createMany({
        data: normalized.map((item) => ({
          ...item,
          invoiceId: invoice.id,
        })),
      });
    }

    const updated = await recalculateInvoiceTotals(invoice.id, { client: tx, skipAuth: true });
    return updated;
  });
}

export async function replaceInvoiceLineItems(input: ReplaceLineItemsInput) {
  await ensureAdminAccess(input.skipAuth);
  const client = getClient(input.client);

  return withTransaction(client, async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: input.invoiceId } });
    if (input.lineItems.length) {
      const normalized = input.lineItems.map((item) => normalizeLineItem(item));
      await tx.invoiceLineItem.createMany({
        data: normalized.map((item) => ({
          ...item,
          invoiceId: input.invoiceId,
        })),
      });
    }
    return recalculateInvoiceTotals(input.invoiceId, { client: tx, skipAuth: true });
  });
}

function aggregateAllocations(allocations: PaymentAllocationInput[]) {
  const aggregated = allocations.reduce<Record<string, number>>((acc, allocation) => {
    acc[allocation.invoiceId] = (acc[allocation.invoiceId] ?? 0) + allocation.amountCents;
    return acc;
  }, {});

  return Object.entries(aggregated).map(([invoiceId, amountCents]) => ({ invoiceId, amountCents }));
}

async function buildOldestOpenAllocations(
  tx: Prisma.TransactionClient,
  familyId: string,
  amountCents: number
): Promise<AllocationBuildResult> {
  if (amountCents <= 0) return { allocations: [], invoices: [] };
  const invoices = await tx.invoice.findMany({
    where: { familyId, status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] } },
    include: { enrolment: { include: { plan: true } }, lineItems: { select: { id: true, kind: true } } },
    orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }],
  });

  let remaining = amountCents;
  const allocations: PaymentAllocationInput[] = [];

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

async function validateAllocations(
  tx: Prisma.TransactionClient,
  familyId: string,
  allocations: PaymentAllocationInput[]
): Promise<AllocationBuildResult> {
  if (!allocations.length) return { allocations: [], invoices: [] };

  const aggregated = aggregateAllocations(allocations);
  const invoiceIds = aggregated.map((a) => a.invoiceId);

  const invoices = await tx.invoice.findMany({
    where: { id: { in: invoiceIds } },
    include: { enrolment: { include: { plan: true } }, lineItems: { select: { id: true, kind: true } } },
  });

  if (invoices.length !== invoiceIds.length) {
    throw new Error("One or more invoices could not be found.");
  }

  const requestedByInvoice = new Map(aggregated.map((a) => [a.invoiceId, a.amountCents]));

  for (const invoice of invoices) {
    if (invoice.familyId !== familyId) {
      throw new Error("Payment allocations must belong to the same family.");
    }
    if (invoice.status === InvoiceStatus.VOID) {
      throw new Error("Cannot allocate payments to void invoices.");
    }
    const requested = requestedByInvoice.get(invoice.id) ?? 0;
    const balance = Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
    if (requested > balance) {
      throw new Error("Allocation exceeds the invoice balance.");
    }
  }

  return { allocations: aggregated, invoices };
}

async function persistAllocations(
  tx: Prisma.TransactionClient,
  params: {
    paymentId: string;
    allocations: PaymentAllocationInput[];
    invoices: InvoiceWithEntitlement[];
    paidAt: Date;
  }
) {
  const { paymentId, allocations, invoices, paidAt } = params;
  if (allocations.length === 0) return { allocatedCents: 0 };

  const aggregated = aggregateAllocations(allocations);
  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

  await tx.paymentAllocation.createMany({
    data: aggregated.map((allocation) => ({
      paymentId,
      invoiceId: allocation.invoiceId,
      amountCents: allocation.amountCents,
    })),
  });

  for (const allocation of aggregated) {
    const invoice = invoiceMap.get(allocation.invoiceId);
    if (!invoice) {
      await tx.invoice.update({
        where: { id: allocation.invoiceId },
        data: { amountPaidCents: { increment: allocation.amountCents } },
      });
      continue;
    }

    const nextPaid = Math.max(invoice.amountPaidCents + allocation.amountCents, 0);
    const status =
      invoice.status === InvoiceStatus.VOID
        ? InvoiceStatus.VOID
        : nextInvoiceStatus({
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
              paidAt:
                status === InvoiceStatus.PAID
                  ? invoice.paidAt ?? paidAt
                  : status === InvoiceStatus.VOID
                    ? invoice.paidAt
                    : null,
            },
            include: {
              enrolment: {
                include: {
                  plan: true,
                  template: true, // ✅ add this
                },
              },
              lineItems: { select: { kind: true, quantity: true } },
            },
          });


    if (status === InvoiceStatus.PAID && invoice.status !== InvoiceStatus.PAID) {
      await applyPaidInvoiceToEnrolment(updated.id, { client: tx, invoice: updated });
    }
  }

  const allocatedCents = aggregated.reduce((sum, allocation) => sum + allocation.amountCents, 0);
  return { allocatedCents };
}

export async function createPaymentAndAllocate(input: CreatePaymentAndAllocateInput) {
  await ensureAdminAccess(input.skipAuth);
  const client = getClient(input.client);

  if (input.amountCents <= 0) {
    throw new Error("Payment amount must be positive.");
  }

  return withTransaction(client, async (tx) => {
    if (input.idempotencyKey) {
      const existing = await tx.payment.findFirst({
        where: { familyId: input.familyId, idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        const allocated = await tx.paymentAllocation.aggregate({
          where: { paymentId: existing.id },
          _sum: { amountCents: true },
        });
        const allocatedCents = allocated._sum.amountCents ?? 0;
        return {
          payment: existing,
          allocations: [] as PaymentAllocationInput[],
          allocatedCents,
          unallocatedCents: Math.max(existing.amountCents - allocatedCents, 0),
        };
      }
    }

    const payment = await tx.payment.create({
      data: {
        familyId: input.familyId,
        amountCents: input.amountCents,
        paidAt: input.paidAt ?? new Date(),
        method: input.method?.trim() || undefined,
        note: input.note?.trim() || undefined,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    let allocations: PaymentAllocationInput[] = [];
    let invoices: InvoiceWithEntitlement[] = [];

    if (input.allocations?.length) {
      const manual = await validateAllocations(tx, input.familyId, input.allocations);
      allocations = manual.allocations;
      invoices = manual.invoices;
    } else if (input.strategy === "oldest-open-first") {
      const auto = await buildOldestOpenAllocations(tx, input.familyId, input.amountCents);
      allocations = auto.allocations;
      invoices = auto.invoices;
    }

    const { allocatedCents } = await persistAllocations(tx, {
      paymentId: payment.id,
      allocations,
      invoices,
      paidAt: payment.paidAt ?? new Date(),
    });

    return {
      payment,
      allocations,
      allocatedCents,
      unallocatedCents: Math.max(payment.amountCents - allocatedCents, 0),
    };
  });
}

export async function allocatePaymentOldestOpenInvoices(paymentId: string) {
  await ensureAdminAccess();
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { allocations: true },
    });
    if (!payment) throw new Error("Payment not found.");
    if (payment.status === PaymentStatus.VOID) {
      throw new Error("Cannot allocate a void payment.");
    }

    const alreadyAllocated = payment.allocations.reduce((sum, alloc) => sum + alloc.amountCents, 0);
    const remaining = payment.amountCents - alreadyAllocated;
    if (remaining <= 0) {
      return { payment, allocations: [] as PaymentAllocationInput[], allocatedCents: 0, unallocatedCents: 0 };
    }

    const auto = await buildOldestOpenAllocations(tx, payment.familyId, remaining);
    const { allocatedCents } = await persistAllocations(tx, {
      paymentId: payment.id,
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

export async function applyEntitlementsForPaidInvoice(
  invoiceId: string,
  options?: { client?: PrismaClientOrTx; skipAuth?: boolean }
) {
  await ensureAdminAccess(options?.skipAuth);
  const client = getClient(options?.client);

  return withTransaction(client, async (tx) => {
    return applyPaidInvoiceToEnrolment(invoiceId, { client: tx });
  });
}
