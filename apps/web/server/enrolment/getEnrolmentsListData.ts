"use server";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const enrolmentListSelect = {
  id: true,
  studentId: true,
  templateId: true,
  startDate: true,
  status: true,
  student: {
    select: {
      id: true,
      name: true,
      family: {
        select: { name: true },
      },
    },
  },
  template: {
    select: {
      id: true,
      name: true,
      level: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.EnrolmentSelect;

export type EnrolmentListItem = Prisma.EnrolmentGetPayload<{
  select: typeof enrolmentListSelect;
}>;

export async function getEnrolmentsListData(): Promise<EnrolmentListItem[]> {
  return prisma.enrolment.findMany({
    orderBy: [
      { startDate: "desc" },
      { createdAt: "desc" },
    ],
    select: enrolmentListSelect,
  });
}
