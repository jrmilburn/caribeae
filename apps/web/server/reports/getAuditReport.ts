"use server";

import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import { InvoiceLineItemKind, InvoiceStatus, PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export type AuditReportFilters = {
  from?: Date | null;
  to?: Date | null;
  includeVoided?: boolean;
};

export type AuditInvoiceLineItem = {
  id: string;
  invoiceId: string;
  kind: InvoiceLineItemKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  productId: string | null;
  productName: string | null;
  enrolmentId: string | null;
  studentId: string | null;
  studentName: string | null;
  levelId: string | null;
  levelName: string | null;
  issuedAt: Date | null;
  invoiceStatus: InvoiceStatus;
  familyId: string;
  familyName: string;
};

export type AuditInvoice = {
  id: string;
  issuedAt: Date | null;
  status: InvoiceStatus;
  familyId: string;
  familyName: string;
  totalCents: number;
  amountPaidCents: number;
  amountOwingCents: number;
  lineItems: AuditInvoiceLineItem[];
};

export type SalesSummary = {
  totalSalesCents: number;
  totalsByKind: {
    kind: InvoiceLineItemKind;
    amountCents: number;
    quantity: number;
  }[];
  totalsByProduct: {
    productId: string;
    productName: string;
    amountCents: number;
    quantity: number;
  }[];
  enrolmentTotals: {
    totalAmountCents: number;
    totalQuantity: number;
    byLevel: {
      levelId: string;
      levelName: string;
      amountCents: number;
      quantity: number;
    }[];
  };
};

export type AuditPaymentAllocation = {
  paymentId: string;
  paymentFamilyId: string;
  paymentFamilyName: string;
  paymentMethod: string | null;
  paymentPaidAt: Date;
  paymentAmountCents: number;
  paymentStatus: PaymentStatus;
  invoiceId: string;
  invoiceIssuedAt: Date | null;
  invoiceStatus: InvoiceStatus;
  invoiceFamilyId: string;
  invoiceFamilyName: string;
  amountCents: number;
};

export type AuditPayment = {
  id: string;
  familyId: string;
  familyName: string;
  paidAt: Date;
  method: string | null;
  amountCents: number;
  status: PaymentStatus;
  allocatedCents: number;
  unallocatedCents: number;
  allocations: AuditPaymentAllocation[];
};

export type CashSummary = {
  totalReceivedCents: number;
  byMethod: { method: string; amountCents: number }[];
  allocatedCents: number;
  unallocatedCents: number;
};

export type AuditReport = {
  filters: {
    from: Date;
    to: Date;
    includeVoided: boolean;
  };
  sales: {
    summary: SalesSummary;
    invoices: AuditInvoice[];
    lineItems: AuditInvoiceLineItem[];
  };
  cash: {
    summary: CashSummary;
    payments: AuditPayment[];
    allocations: AuditPaymentAllocation[];
  };
};

function normalizeRange(filters: AuditReportFilters) {
  const now = new Date();
  const defaultFrom = startOfMonth(now);
  const defaultTo = endOfMonth(now);

  const from = filters.from ? startOfDay(filters.from) : defaultFrom;
  const rawTo = filters.to ? endOfDay(filters.to) : defaultTo;
  const to = rawTo < from ? endOfDay(from) : rawTo;

  return {
    from,
    to,
    includeVoided: Boolean(filters.includeVoided),
  } as const;
}

function toCsvFriendlyMethod(value: string | null | undefined) {
  return value && value.trim() ? value : "Unknown";
}

export async function getAuditReport(filters: AuditReportFilters = {}): Promise<AuditReport> {
  await getOrCreateUser();
  await requireAdmin();

  const normalized = normalizeRange(filters);

  const invoiceWhere = {
    issuedAt: {
      gte: normalized.from,
      lte: normalized.to,
    },
    status: normalized.includeVoided ? undefined : { not: InvoiceStatus.VOID },
  } as const;

  const paymentWhere = {
    paidAt: {
      gte: normalized.from,
      lte: normalized.to,
    },
    status: normalized.includeVoided ? undefined : { not: PaymentStatus.VOID },
  } as const;

  const [lineItems, totalsByKind, totalsByProduct, enrolmentItems, payments, paymentTotals] =
    await prisma.$transaction([
      prisma.invoiceLineItem.findMany({
        where: { invoice: invoiceWhere },
        include: {
          invoice: {
            select: {
              id: true,
              issuedAt: true,
              status: true,
              family: { select: { id: true, name: true } },
              amountPaidCents: true,
            },
          },
          product: { select: { id: true, name: true } },
          enrolment: {
            select: {
              id: true,
              student: { select: { id: true, name: true, level: { select: { id: true, name: true } } } },
            },
          },
          student: { select: { id: true, name: true, level: { select: { id: true, name: true } } } },
        },
        orderBy: [
          { invoice: { issuedAt: "desc" } },
          { createdAt: "asc" },
        ],
      }),
      prisma.invoiceLineItem.groupBy({
        by: ["kind"],
        where: { invoice: invoiceWhere },
        _sum: { amountCents: true, quantity: true },
        orderBy: { _sum: { amountCents: "desc" } }, // or "asc"
      }),
      prisma.invoiceLineItem.groupBy({
        by: ["productId"],
        where: { invoice: invoiceWhere, productId: { not: null } },
        _sum: { amountCents: true, quantity: true },
        orderBy: { _sum: { amountCents: "desc" } },
        take: 10,
      }),
      prisma.invoiceLineItem.findMany({
        where: { invoice: invoiceWhere, kind: InvoiceLineItemKind.ENROLMENT },
        select: {
          amountCents: true,
          quantity: true,
          student: { select: { id: true, level: { select: { id: true, name: true } } } },
          enrolment: {
            select: { student: { select: { id: true, level: { select: { id: true, name: true } } } } },
          },
        },
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        include: {
          family: { select: { id: true, name: true } },
          allocations: {
            include: {
              invoice: { select: { id: true, issuedAt: true, status: true, family: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { paidAt: "desc" },
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: paymentWhere,
        _sum: { amountCents: true },
        orderBy: { _sum: { amountCents: "desc" } },
      }),
    ]);

  const invoiceLineItems: AuditInvoiceLineItem[] = lineItems.map((item) => {
    const student = item.student ?? item.enrolment?.student ?? null;
    return {
      id: item.id,
      invoiceId: item.invoiceId,
      kind: item.kind,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      amountCents: item.amountCents,
      productId: item.productId,
      productName: item.product?.name ?? null,
      enrolmentId: item.enrolmentId,
      studentId: student?.id ?? null,
      studentName: student?.name ?? null,
      levelId: student?.level?.id ?? null,
      levelName: student?.level?.name ?? null,
      issuedAt: item.invoice?.issuedAt ?? null,
      invoiceStatus: item.invoice?.status ?? InvoiceStatus.DRAFT,
      familyId: item.invoice?.family.id ?? "",
      familyName: item.invoice?.family.name ?? "",
    };
  });

  const amountPaidByInvoice = new Map<string, number>();
  for (const item of lineItems) {
    if (item.invoice) {
      amountPaidByInvoice.set(item.invoiceId, item.invoice.amountPaidCents);
    }
  }

  const productNameById = new Map<string, string>();
  for (const item of lineItems) {
    if (item.productId && item.product?.name) {
      productNameById.set(item.productId, item.product.name);
    }
  }

  const invoiceMap = new Map<string, AuditInvoice>();

  for (const item of invoiceLineItems) {
    const existing = invoiceMap.get(item.invoiceId);
    if (!existing) {
      invoiceMap.set(item.invoiceId, {
        id: item.invoiceId,
        issuedAt: item.issuedAt,
        status: item.invoiceStatus,
        familyId: item.familyId,
        familyName: item.familyName,
        totalCents: item.amountCents,
        amountPaidCents: amountPaidByInvoice.get(item.invoiceId) ?? 0,
        amountOwingCents: 0,
        lineItems: [item],
      });
      continue;
    }

    existing.totalCents += item.amountCents;
    existing.lineItems.push(item);
  }

  for (const invoice of invoiceMap.values()) {
    const paid = invoice.amountPaidCents;
    invoice.amountOwingCents = Math.max(invoice.totalCents - paid, 0);
  }

  const salesSummary: SalesSummary = {
    totalSalesCents: invoiceLineItems.reduce((sum, item) => sum + item.amountCents, 0),
    totalsByKind: totalsByKind.map((row) => ({
      kind: row.kind,
      amountCents: row._sum?.amountCents ?? 0,
      quantity: row._sum?.quantity ?? 0,
    })),

    totalsByProduct: totalsByProduct.map((row) => ({
      productId: row.productId ?? "unknown",
      productName: row.productId
        ? productNameById.get(row.productId) ?? "Unknown product"
        : "Unknown product",
      amountCents: row._sum?.amountCents ?? 0,
      quantity: row._sum?.quantity ?? 0,
    })),
    enrolmentTotals: { totalAmountCents: 0, totalQuantity: 0, byLevel: [] },
  };

  const levelTotals = new Map<string, { amountCents: number; quantity: number; levelName: string }>();
  let enrolmentAmount = 0;
  let enrolmentQuantity = 0;

  for (const item of enrolmentItems) {
    enrolmentAmount += item.amountCents;
    enrolmentQuantity += item.quantity ?? 0;

    const studentLevel = item.student?.level ?? item.enrolment?.student?.level ?? null;
    if (studentLevel) {
      const existing = levelTotals.get(studentLevel.id) ?? { amountCents: 0, quantity: 0, levelName: studentLevel.name };
      existing.amountCents += item.amountCents;
      existing.quantity += item.quantity ?? 0;
      levelTotals.set(studentLevel.id, existing);
    }
  }

  salesSummary.enrolmentTotals = {
    totalAmountCents: enrolmentAmount,
    totalQuantity: enrolmentQuantity,
    byLevel: Array.from(levelTotals.entries()).map(([levelId, value]) => ({
      levelId,
      levelName: value.levelName,
      amountCents: value.amountCents,
      quantity: value.quantity,
    })),
  };

  const paymentAllocations: AuditPaymentAllocation[] = [];
  const paymentsWithDerived: AuditPayment[] = payments.map((payment) => {
    const allocated = payment.allocations.reduce((sum, alloc) => sum + alloc.amountCents, 0);
    const unallocated = Math.max(payment.amountCents - allocated, 0);

    const allocations = payment.allocations.map((alloc) => {
      const allocation: AuditPaymentAllocation = {
        paymentId: payment.id,
        paymentFamilyId: payment.familyId,
        paymentFamilyName: payment.family?.name ?? "",
        paymentMethod: payment.method,
        paymentPaidAt: payment.paidAt,
        paymentAmountCents: payment.amountCents,
        paymentStatus: payment.status,
        invoiceId: alloc.invoiceId,
        invoiceIssuedAt: alloc.invoice?.issuedAt ?? null,
        invoiceStatus: alloc.invoice?.status ?? InvoiceStatus.DRAFT,
        invoiceFamilyId: alloc.invoice?.family?.id ?? "",
        invoiceFamilyName: alloc.invoice?.family?.name ?? "",
        amountCents: alloc.amountCents,
      };
      paymentAllocations.push(allocation);
      return allocation;
    });

    return {
      id: payment.id,
      familyId: payment.familyId,
      familyName: payment.family?.name ?? "",
      paidAt: payment.paidAt,
      method: payment.method,
      amountCents: payment.amountCents,
      status: payment.status,
      allocatedCents: allocated,
      unallocatedCents: unallocated,
      allocations,
    };
  });

  const cashSummary: CashSummary = {
    totalReceivedCents: payments.reduce((sum, payment) => sum + payment.amountCents, 0),
    byMethod: paymentTotals.map((row) => ({
      method: toCsvFriendlyMethod(row.method),
      amountCents: row._sum?.amountCents ?? 0,
    })),
    allocatedCents: paymentsWithDerived.reduce((sum, payment) => sum + payment.allocatedCents, 0),
    unallocatedCents: paymentsWithDerived.reduce((sum, payment) => sum + payment.unallocatedCents, 0),
  };

  return {
    filters: normalized,
    sales: {
      summary: salesSummary,
      invoices: Array.from(invoiceMap.values()).sort((a, b) => (b.issuedAt?.getTime() ?? 0) - (a.issuedAt?.getTime() ?? 0)),
      lineItems: invoiceLineItems,
    },
    cash: {
      summary: cashSummary,
      payments: paymentsWithDerived,
      allocations: paymentAllocations,
    },
  };
}
