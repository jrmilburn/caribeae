"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { InvoiceStatus, EnrolmentStatus, MessageChannel } from "@prisma/client";

export type DashboardSummary = {
  families: number;
  students: number;
  activeEnrolments: number;
  outstandingInvoices: number;
  overdueInvoices: number;
  smsLast7Days: number;
  emailLast7Days: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await getOrCreateUser();
  await requireAdmin();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    families,
    students,
    activeEnrolments,
    outstandingInvoices,
    overdueInvoices,
    smsLast7Days,
    emailLast7Days,
  ] = await Promise.all([
    prisma.family.count(),
    prisma.student.count(),
    prisma.enrolment.count({ where: { status: EnrolmentStatus.ACTIVE } }),
    prisma.invoice.count({
      where: { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] } },
    }),
    prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
    prisma.message.count({
      where: { createdAt: { gte: sevenDaysAgo }, channel: MessageChannel.SMS },
    }),
    prisma.message.count({
      where: { createdAt: { gte: sevenDaysAgo }, channel: MessageChannel.EMAIL },
    }),
  ]);

  return {
    families,
    students,
    activeEnrolments,
    outstandingInvoices,
    overdueInvoices,
    smsLast7Days,
    emailLast7Days,
  };
}
