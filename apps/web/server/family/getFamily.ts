"use server";

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { z } from "zod";

export default async function getFamily(id: string) {
  await getOrCreateUser();
  await requireAdmin();

  const familyId = z.string().min(1).parse(id);

  const family = await prisma.family.findUnique({
    where: {
      id: familyId,
    },
    include: {
      students: {
        include: {
          level: true,
          enrolments: {
            select: {
              id: true,
              templateId: true,
              startDate: true,
              endDate: true,
              paidThroughDate: true,
              status: true,
              classAssignments: {
                select: {
                  templateId: true,
                  template: { select: { id: true, name: true, dayOfWeek: true, startTime: true, endTime: true } },
                },
              },
            },
          },
          levelChanges: {
            include: {
              fromLevel: true,
              toLevel: true,
            },
            orderBy: { effectiveDate: "desc" },
          },
        },
      },
      invoices: {
        include: {
          enrolment: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              templateId: true,
              plan: { select: { name: true, billingType: true } },
            },
          },
          lineItems: true,
        },
        orderBy: { issuedAt: "desc" },
      },
    },
  });

  return family;
}
