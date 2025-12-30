"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";

function formatDate(value?: Date | null) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function getFamilyBillingSummary(familyId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      name: true,
      primaryContactName: true,
      primaryPhone: true,
      students: {
        select: {
          id: true,
          name: true,
          enrolments: {
            include: {
              plan: true,
              template: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!family) throw new Error("Family not found.");

  const [openInvoices, payments] = await Promise.all([
    prisma.invoice.findMany({
      where: { familyId, status: { in: OPEN_INVOICE_STATUSES } },
      include: {
        enrolment: {
          include: {
            plan: true,
            student: { select: { name: true } },
          },
        },
      },
      orderBy: [{ dueAt: "asc" }, { issuedAt: "asc" }],
    }),
    prisma.payment.findMany({
      where: { familyId },
      orderBy: { paidAt: "desc" },
      take: 5,
      include: {
        allocations: {
          include: {
            invoice: {
              select: {
                id: true,
                status: true,
                amountCents: true,
                amountPaidCents: true,
                issuedAt: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const openInvoicesWithBalance = openInvoices.map((invoice) => ({
    ...invoice,
    balanceCents: Math.max(invoice.amountCents - invoice.amountPaidCents, 0),
  }));

  const outstandingCents = openInvoicesWithBalance.reduce((sum, inv) => sum + inv.balanceCents, 0);

  const nextDueInvoice = [...openInvoicesWithBalance]
    .sort((a, b) => {
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      if (a.status === "OVERDUE" && b.status !== "OVERDUE") return -1;
      if (b.status === "OVERDUE" && a.status !== "OVERDUE") return 1;
      return aDue - bDue;
    })
    .find((inv) => inv.balanceCents > 0);

  const enrolments = family.students.flatMap((student) =>
    (student.enrolments ?? []).map((enrolment) => ({
      id: enrolment.id,
      studentId: student.id,
      studentName: student.name,
      planId: enrolment.planId,
      planName: enrolment.plan?.name ?? "Unassigned plan",
      billingType: enrolment.plan?.billingType ?? null,
      planPriceCents: enrolment.plan?.priceCents ?? 0,
      durationWeeks: enrolment.plan?.durationWeeks ?? null,
      blockClassCount: enrolment.plan?.blockClassCount ?? enrolment.plan?.blockLength ?? null,
      creditsRemaining: enrolment.creditsRemaining ?? 0,
      paidThroughDate: formatDate(enrolment.paidThroughDate),
      startDate: formatDate(enrolment.startDate),
      endDate: formatDate(enrolment.endDate),
      templateName: enrolment.template?.name ?? null,
      status: enrolment.status,
    }))
  );

  const latestPaidThrough = enrolments
    .map((e) => e.paidThroughDate)
    .filter(Boolean) as Date[];
  const paidThroughLatest = latestPaidThrough.length
    ? latestPaidThrough.reduce((acc, curr) => (acc && acc > curr ? acc : curr))
    : null;

  const creditsTotal = enrolments.reduce((sum, e) => sum + (e.creditsRemaining ?? 0), 0);

  return {
    family: {
      id: family.id,
      name: family.name,
      primaryContactName: family.primaryContactName,
      primaryPhone: family.primaryPhone,
    },
    openInvoices: openInvoicesWithBalance,
    outstandingCents,
    nextDueInvoice: nextDueInvoice
      ? {
          id: nextDueInvoice.id,
          dueAt: formatDate(nextDueInvoice.dueAt),
          balanceCents: nextDueInvoice.balanceCents,
          status: nextDueInvoice.status,
        }
      : null,
    enrolments,
    paidThroughLatest,
    creditsTotal,
    payments,
  };
}

export type FamilyBillingSummary = Awaited<ReturnType<typeof getFamilyBillingSummary>>;
