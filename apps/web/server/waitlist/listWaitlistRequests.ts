import "server-only";

import { EnrolmentStatus, WaitlistRequestStatus } from "@prisma/client";

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
}) {
  const where = params?.status ? { status: params.status } : undefined;

  const [totalCount, requests] = await prisma.$transaction([
    prisma.waitlistRequest.count({ where }),
    prisma.waitlistRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
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

  const items: WaitlistRequestSummary[] = requests.map((request) => ({
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

  return { totalCount, items };
}
