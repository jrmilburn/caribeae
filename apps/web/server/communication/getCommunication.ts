"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export type CommunicationDetail = {
  id: string;
  createdAt: Date;
  channel: "SMS" | "EMAIL";
  direction: "OUTBOUND" | "INBOUND";
  status: "PENDING" | "SENT" | "DELIVERED" | "FAILED";
  subject: string | null;
  body: string;
  to: string | null;
  from: string | null;
  errorMessage: string | null;
  family?: { id: string; name: string | null } | null;
};

export async function getCommunication(id: string): Promise<CommunicationDetail | null> {
  await getOrCreateUser();
  await requireAdmin();

  const message = await prisma.message.findUnique({
    where: { id },
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
      errorMessage: true,
      family: { select: { id: true, name: true } },
    },
  });

  if (!message) return null;

  return {
    id: message.id,
    createdAt: message.createdAt,
    channel: message.channel,
    direction: message.direction,
    status: message.status,
    subject: message.subject,
    body: message.body,
    to: message.toEmail ?? message.toNumber ?? null,
    from: message.fromEmail ?? message.fromNumber ?? null,
    errorMessage: message.errorMessage,
    family: message.family,
  };
}
