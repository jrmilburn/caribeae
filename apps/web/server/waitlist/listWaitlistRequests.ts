import "server-only";

import { EnrolmentStatus, Prisma, WaitlistRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type WaitlistRequestSummary = {
  id: string;
  createdAt: Date;
  status: WaitlistRequestStatus;
  effectiveDate: Date;
  notes: string | null;
  adminNotes: string | null;
  family: { id: string; name: string };
  student: {
    id: string;
    name: string;
    level: { id: string; name: string } | null;
    currentClass: {
      id: string;
      name: string | null;
      dayOfWeek: number | null;
      startTime: number | null;
    } | null;
  };
  requestedClass: {
    id: string;
    name: string | null;
    dayOfWeek: number | null;
    startTime: number | null;
    level: { id: string; name: string } | null;
  };
};

export async function listWaitlistRequests(params?: {
  status?: WaitlistRequestStatus | null;
  q?: string | null;
  pageSize?: number;
  cursor?: string | null;
}): Promise<{ totalCount: number; items: WaitlistRequestSummary[]; nextCursor: string | null }> {
  const pageSize = params?.pageSize ?? 25;
  const cursor = params?.cursor ?? null;

  const where: Prisma.WaitlistRequestWhereInput = {};
  if (params?.status) {
    where.status = params.status;
  }
  if (params?.q) {
    where.OR = [
      { family: { name: { contains: params.q, mode: "insensitive" } } },
      { student: { name: { contains: params.q, mode: "insensitive" } } },
      { requestedClass: { name: { contains: params.q, mode: "insensitive" } } },
      { notes: { contains: params.q, mode: "insensitive" } },
      { adminNotes: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const [totalCount, requests] = await prisma.$transaction([
    prisma.waitlistRequest.count({ where }),
    prisma.waitlistRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        family: { select: { id: true, name: true } },
        student: {
          select: {
            id: true,
            name: true,
            level: { select: { id: true, name: true } },
            enrolments: {
              where: { status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] } },
              orderBy: { startDate: "desc" },
              take: 1,
              select: {
                template: {
                  select: { id: true, name: true, dayOfWeek: true, startTime: true },
                },
              },
            },
          },
        },
        requestedClass: {
          select: {
            id: true,
            name: true,
            dayOfWeek: true,
            startTime: true,
            level: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const hasNext = requests.length > pageSize;
  const sliced = hasNext ? requests.slice(0, pageSize) : requests;
  const nextCursor = hasNext ? sliced[sliced.length - 1]?.id ?? null : null;

  const items: WaitlistRequestSummary[] = sliced.map((request) => ({
    id: request.id,
    createdAt: request.createdAt,
    status: request.status,
    effectiveDate: request.effectiveDate,
    notes: request.notes,
    adminNotes: request.adminNotes,
    family: request.family,
    student: {
      id: request.student.id,
      name: request.student.name,
      level: request.student.level,
      currentClass: request.student.enrolments[0]?.template ?? null,
    },
    requestedClass: request.requestedClass,
  }));

  return { totalCount, items, nextCursor };
}
