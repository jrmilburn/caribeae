"use server";

import { prisma } from "@/lib/prisma";

import { getOrCreateUser } from "@/lib/getOrCreateUser";

export default async function getFamily(id: string) {
  await getOrCreateUser();

  const family = await prisma.family.findUnique({
    where: {
      id,
    },
    include: {
      students: {
        include: {
          enrolments: {
            select: {
              id: true,
              templateId: true,
              startDate: true,
              endDate: true,
              paidThroughDate: true,
              status: true,
            },
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
        },
        orderBy: { issuedAt: "desc" },
      },
    },
  });

  return family;
}
