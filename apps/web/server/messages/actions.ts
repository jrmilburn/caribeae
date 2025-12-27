"use server";
import { prisma } from "@/lib/prisma";
import twilio from "twilio";
import { supaServer, inboxTopic, convoTopic } from "@/lib/realtime/supabase-server";


export type SAClientItem = {
  clientId: string;
  lastBody: string;
  lastDirection: "OUTBOUND" | "INBOUND";
  lastStatus: "PENDING" | "SENT" | "DELIVERED" | "FAILED";
  lastAt: string;
  client: { id: string; name: string | null; phone: string | null } | null; // <- allow null
};

export async function listRecentClients(): Promise<SAClientItem[]> {
  const items = await prisma.message.findMany({
    where: { clientId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      clientId: true,
      body: true,
      direction: true,
      status: true,
      createdAt: true,
      client: { select: { id: true, name: true, phone: true } },
    },
  });
  const seen = new Set<string>();
  return items
    .filter((m) => m.clientId && !seen.has(m.clientId) && (seen.add(m.clientId!), true))
    .map((m) => ({
      clientId: m.clientId!,
      lastBody: m.body,
      lastDirection: m.direction,
      lastStatus: m.status,
      lastAt: m.createdAt.toISOString(),
      client: m.client,
    }));
}

export type SAMessage = {
  id: string;
  createdAt: string;
  direction: "OUTBOUND" | "INBOUND";
  body: string;
  fromNumber: string;
  toNumber: string;
  status: "PENDING" | "SENT" | "DELIVERED" | "FAILED";
};

export async function loadConversation(clientId: string): Promise<SAMessage[]> {
  const rows = await prisma.message.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
}

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

export async function sendToClient({
  clientId,
  to,
  body,
}: { clientId: string; to: string; body: string }) {
  const rec = await prisma.message.create({
    data: {
      direction: "OUTBOUND",
      body,
      fromNumber: process.env.TWILIO_FROM ?? `msvc:${process.env.TWILIO_MESSAGING_SERVICE_SID!}`,
      toNumber: to,
      status: "PENDING",
      clientId,
    },
  });

  try {
    const msg = await twilioClient.messages.create({
      to,
      body,
      ...(process.env.TWILIO_MESSAGING_SERVICE_SID
        ? { messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID }
        : { from: process.env.TWILIO_FROM }),
      ...(process.env.TWILIO_STATUS_CALLBACK ? { statusCallback: process.env.TWILIO_STATUS_CALLBACK } : {}),
    });

    await supaServer.channel(convoTopic(clientId)).send({
      type: "broadcast",
      event: "message:new",
      payload: {
        id: rec.id,
        body,
        fromNumber: rec.fromNumber,
        toNumber: rec.toNumber,
        direction: "OUTBOUND",
        status: "PENDING",
        createdAt: rec.createdAt,
      },
    });
    await supaServer.channel(inboxTopic).send({
      type: "broadcast",
      event: "inbox:updated",
      payload: { clientId },
    });

    await prisma.message.update({ where: { id: rec.id }, data: { status: "SENT", providerSid: msg.sid } });
    return { ok: true, id: rec.id } as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    await prisma.message.update({
      where: { id: rec.id },
      data: { status: "FAILED", errorCode: String(e?.code ?? ""), errorMessage: e?.message ?? "" },
    });
    return { ok: false, error: e?.message } as const;
  }
}