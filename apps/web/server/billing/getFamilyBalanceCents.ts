import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { computeFamilyNetOwing } from "@/server/billing/netOwing";

type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export async function getFamilyBalanceCents(
  familyId: string,
  options?: { client?: PrismaClientOrTx }
) {
  const net = await computeFamilyNetOwing({
    familyId,
    client: options?.client,
  });

  return net.netOwingCents;
}
