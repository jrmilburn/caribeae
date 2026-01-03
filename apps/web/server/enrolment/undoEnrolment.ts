"use server";

import { revalidatePath } from "next/cache";
import { EnrolmentStatus, InvoiceStatus, PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";

export async function undoEnrolment(enrolmentId: string) {
  await getOrCreateUser();
  await requireAdmin();

  const result = await prisma.$transaction(async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: enrolmentId },
      include: {
        student: { select: { id: true } },
        template: { select: { id: true } },
        invoices: {
          include: {
            allocations: { include: { payment: true } },
          },
        },
      },
    });

    if (!enrolment) {
      throw new Error("Enrolment not found.");
    }

    const invoiceIds = enrolment.invoices.map((inv) => inv.id);
    const hasPayments = enrolment.invoices.some((inv) => {
      if (inv.amountPaidCents > 0) return true;
      return inv.allocations.some((allocation) => allocation.payment?.status !== PaymentStatus.VOID);
    });

    if (hasPayments) {
      throw new Error("Refund/undo payments first.");
    }

    if (invoiceIds.length) {
      await tx.paymentAllocation.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.updateMany({
        where: { id: { in: invoiceIds } },
        data: {
          status: InvoiceStatus.VOID,
          amountPaidCents: 0,
          paidAt: null,
          entitlementsAppliedAt: null,
        },
      });
    }

    const creditEvents = await tx.enrolmentCreditEvent.findMany({
      where: { enrolmentId },
      select: { attendanceId: true },
    });

    const attendanceIds = creditEvents
      .map((event) => event.attendanceId)
      .filter((id): id is string => Boolean(id));

    await tx.enrolmentCreditEvent.deleteMany({ where: { enrolmentId } });
    await tx.enrolmentAdjustment.deleteMany({ where: { enrolmentId } });

    if (attendanceIds.length) {
      await tx.attendance.deleteMany({ where: { id: { in: attendanceIds } } });
    }

    const updated = await tx.enrolment.update({
      where: { id: enrolmentId },
      data: {
        status: EnrolmentStatus.CANCELLED,
        cancelledAt: enrolment.cancelledAt ?? new Date(),
        endDate: enrolment.endDate ?? enrolment.startDate,
        paidThroughDate: null,
        paidThroughDateComputed: null,
        nextDueDateComputed: null,
        creditsRemaining: null,
        creditsBalanceCached: null,
      },
      include: { student: true, template: true, plan: true },
    });

    await getEnrolmentBillingStatus(enrolmentId, { client: tx });

    return { enrolment: updated, invoiceIds };
  });

  revalidatePath(`/admin/student/${result.enrolment.studentId}`);
  revalidatePath(`/admin/class/${result.enrolment.templateId}`);
  revalidatePath("/admin/enrolment");

  return result;
}
