"use server";

import { subDays } from "date-fns";
import { InvoiceStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";

import type { BillingDashboardFilters } from "./types";

function normalizeDate(value?: Date | null) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildInvoiceWhere(filters: BillingDashboardFilters): Prisma.InvoiceWhereInput {
  const issuedRange: Prisma.DateTimeFilter = {};
  const start = normalizeDate(filters.startDate ?? undefined);
  const end = normalizeDate(filters.endDate ?? undefined);

  if (start) issuedRange.gte = start;
  if (end) issuedRange.lte = end;

  return {
    status: filters.status && filters.status !== "ALL" ? filters.status : undefined,
    family: filters.search
      ? {
          name: {
            contains: filters.search,
            mode: "insensitive",
          },
        }
      : undefined,
    issuedAt: Object.keys(issuedRange).length > 0 ? issuedRange : undefined,
  };
}

function buildPaymentWhere(filters: BillingDashboardFilters): Prisma.PaymentWhereInput {
  const paidRange: Prisma.DateTimeFilter = {};
  const start = normalizeDate(filters.startDate ?? undefined);
  const end = normalizeDate(filters.endDate ?? undefined);

  if (start) paidRange.gte = start;
  if (end) paidRange.lte = end;

  return {
    family: filters.search
      ? {
          name: {
            contains: filters.search,
            mode: "insensitive",
          },
        }
      : undefined,
    paidAt: Object.keys(paidRange).length > 0 ? paidRange : undefined,
  };
}

export async function getBillingDashboardData(filters: BillingDashboardFilters = {}) {
  await getOrCreateUser();
  await requireAdmin();

  const invoiceWhere = buildInvoiceWhere(filters);
  const paymentWhere = buildPaymentWhere(filters);

  const [invoices, payments, families, openAgg, overdueCount, openCount, paidLast30] =
    await Promise.all([
      prisma.invoice.findMany({
        where: invoiceWhere,
        include: {
          family: { select: { id: true, name: true } },
          allocations: {
            include: {
              payment: { select: { id: true, paidAt: true, method: true, amountCents: true } },
            },
          },
          lineItems: true,
        },
        orderBy: [{ issuedAt: "desc" }],
        take: 30,
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        include: {
          family: { select: { id: true, name: true } },
          allocations: {
            include: {
              invoice: {
                select: {
                  id: true,
                  amountCents: true,
                  amountPaidCents: true,
                  status: true,
                  issuedAt: true,
                  dueAt: true,
                  familyId: true,
                },
              },
            },
          },
        },
        orderBy: { paidAt: "desc" },
        take: 30,
      }),
      prisma.family.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.invoice.aggregate({
        _sum: { amountCents: true, amountPaidCents: true },
        where: { status: { in: OPEN_INVOICE_STATUSES } },
      }),
      prisma.invoice.count({
        where: { status: InvoiceStatus.OVERDUE },
      }),
      prisma.invoice.count({
        where: { status: { in: OPEN_INVOICE_STATUSES } },
      }),
      prisma.payment.aggregate({
        _sum: { amountCents: true },
        where: { paidAt: { gte: subDays(new Date(), 30) } },
      }),
    ]);

  const totalOwingCents =
    Math.max((openAgg._sum.amountCents ?? 0) - (openAgg._sum.amountPaidCents ?? 0), 0) ?? 0;

  const normalizedInvoices = invoices.map((invoice) => ({
    ...invoice,
    amountOwingCents: Math.max(invoice.amountCents - invoice.amountPaidCents, 0),
  }));

  return {
    summary: {
      totalOwingCents,
      overdueCount,
      paidLast30DaysCents: paidLast30._sum.amountCents ?? 0,
      outstandingInvoiceCount: openCount,
    },
    invoices: normalizedInvoices,
    payments,
    families,
    filters: {
      ...filters,
      startDate: normalizeDate(filters.startDate ?? undefined) ?? null,
      endDate: normalizeDate(filters.endDate ?? undefined) ?? null,
    },
  };
}
