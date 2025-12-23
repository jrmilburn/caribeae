"use server"

import type { ClassInstance } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type GetClassInstancesParams = {
  from: Date;
  to: Date;
};

export default async function getClassInstances(
  params: GetClassInstancesParams
): Promise<ClassInstance[]> {
  const { from, to } = params;

  const classInstances = await prisma.classInstance.findMany({
    where: {
      startTime: {
        gte: from,
        lte: to,
      },
    },
    orderBy: {
      startTime: "asc",
    },
    include: {
      level: true,
      template: true,
    },
  });

  return classInstances;
}
