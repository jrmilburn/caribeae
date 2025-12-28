"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

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

export async function listCommunications(): Promise<CommunicationSummary[]> {
  await getOrCreateUser();
  await requireAdmin();

  const messages = await prisma.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
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
