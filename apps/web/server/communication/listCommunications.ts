"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { unstable_noStore as noStore } from "next/cache";
import { Prisma, EnrolmentStatus, MessageChannel, MessageDirection, MessageStatus } from "@prisma/client";

export type CommunicationSummary = {
  id: string;
  createdAt: Date;
  channel: "SMS" | "EMAIL";
  direction: "OUTBOUND" | "INBOUND";
  status: "PENDING" | "SENT" | "DELIVERED" | "FAILED";
  subject: string | null;
  body: string;
  to: string | null;
  from: string | null;
  family?: { id: string; name: string | null } | null;
};

export type CommunicationFilters = {
  channel?: MessageChannel;
  status?: MessageStatus;
  direction?: MessageDirection;
  q?: string;
  familyId?: string;
  classIds?: string[];
};

export async function listCommunications(args?: {
  limit?: number;
  filters?: CommunicationFilters;
}): Promise<CommunicationSummary[]> {
  noStore();

  await getOrCreateUser();
  await requireAdmin();

  const limit = args?.limit ?? 200;
  const f = args?.filters;

  const filters: Prisma.MessageWhereInput[] = [];

  if (f?.channel) filters.push({ channel: f.channel });
  if (f?.status) filters.push({ status: f.status });
  if (f?.direction) filters.push({ direction: f.direction });
  if (f?.familyId) filters.push({ familyId: f.familyId });

  if (f?.q) {
    filters.push({
      OR: [
        { subject: { contains: f.q, mode: "insensitive" } },
        { body: { contains: f.q, mode: "insensitive" } },
        { toEmail: { contains: f.q, mode: "insensitive" } },
        { fromEmail: { contains: f.q, mode: "insensitive" } },
        { toNumber: { contains: f.q, mode: "insensitive" } },
        { fromNumber: { contains: f.q, mode: "insensitive" } },
        { family: { is: { name: { contains: f.q, mode: "insensitive" } } } },
      ],
    });
  }

  const classIds =
    f?.classIds
      ?.map((id) => id.trim())
      .filter(Boolean) ?? [];

  if (classIds.length) {
    const validClassIds = await prisma.classTemplate.findMany({
      where: { id: { in: classIds } },
      select: { id: true },
    });

    const verifiedClassIds = validClassIds.map((c) => c.id);

    if (!verifiedClassIds.length) {
      return [];
    }

    filters.push({
      OR: [
        {
          family: {
            students: {
              some: {
                enrolments: {
                  some: {
                    templateId: { in: verifiedClassIds },
                    status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] },
                  },
                },
              },
            },
          },
        },
      ],
    });
  }

  const where: Prisma.MessageWhereInput =
    filters.length === 0 ? {} : { AND: filters };

  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      createdAt: true,
      channel: true,
      direction: true,
      status: true,
      subject: true,
      body: true,
      toEmail: true,
      fromEmail: true,
      toNumber: true,
      fromNumber: true,
      family: { select: { id: true, name: true } },
    },
  });

  return messages.map((message) => ({
    id: message.id,
    createdAt: message.createdAt,
    channel: message.channel,
    direction: message.direction,
    status: message.status,
    subject: message.subject,
    body: message.body,
    to: message.toEmail ?? message.toNumber ?? null,
    from: message.fromEmail ?? message.fromNumber ?? null,
    family: message.family,
  }));
}
