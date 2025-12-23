"use server"

import type { ClassInstance } from "@prisma/client";

import { prisma } from "@/lib/prisma";


export default async function getClassInstancesRaw(): Promise<ClassInstance[]> {

  const classInstances = await prisma.classInstance.findMany({
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
