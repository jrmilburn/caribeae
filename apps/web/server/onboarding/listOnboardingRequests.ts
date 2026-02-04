"use server";

import { Prisma } from "@prisma/client";
import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export type OnboardingRequestSummary = {
  id: string;
  guardianName: string;
  phone: string | null;
  email: string | null;
  status: "NEW" | "ACCEPTED" | "DECLINED";
  createdAt: Date;
  reviewedAt: Date | null;
  students: unknown;
  availability: unknown;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  familyId: string | null;
};

export type OnboardingRequestFilters = {
  status?: "NEW" | "ACCEPTED" | "DECLINED" | null;
  q?: string | null;
};

export async function listOnboardingRequests(args?: {
  pageSize?: number;
  cursor?: string | null;
  filters?: OnboardingRequestFilters;
}): Promise<{ items: OnboardingRequestSummary[]; totalCount: number; nextCursor: string | null }> {
  noStore();

  await getOrCreateUser();
  await requireAdmin();

  const pageSize = args?.pageSize ?? 25;
  const cursor = args?.cursor ?? null;
  const filters = args?.filters;

  const where: Prisma.OnboardingRequestWhereInput = {};
  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.q) {
    where.OR = [
      { guardianName: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { phone: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const [items, totalCount] = await Promise.all([
    prisma.onboardingRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        guardianName: true,
        phone: true,
        email: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
        studentsJson: true,
        availabilityJson: true,
        address: true,
        emergencyContactName: true,
        emergencyContactPhone: true,
        familyId: true,
      },
    }),
    prisma.onboardingRequest.count({ where }),
  ]);

  const hasNext = items.length > pageSize;
  const sliced = hasNext ? items.slice(0, pageSize) : items;
  const nextCursor = hasNext ? sliced[sliced.length - 1]?.id ?? null : null;

  return {
    items: sliced.map((item) => ({
      id: item.id,
      guardianName: item.guardianName,
      phone: item.phone,
      email: item.email,
      status: item.status,
      createdAt: item.createdAt,
      reviewedAt: item.reviewedAt,
      students: item.studentsJson,
      availability: item.availabilityJson,
      address: item.address,
      emergencyContactName: item.emergencyContactName,
      emergencyContactPhone: item.emergencyContactPhone,
      familyId: item.familyId,
    })),
    totalCount,
    nextCursor,
  };
}
