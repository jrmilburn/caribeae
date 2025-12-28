"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import twilio from "twilio";
import { supaServer, inboxTopic, convoTopic } from "@/lib/realtime/supabase-server";

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Missing Twilio credentials");
  return twilio(sid, token);
}

export type InboxConversation = {
  id: string;
  phoneNumber: string;
  lastBody: string;
  lastDirection: "OUTBOUND" | "INBOUND";
  lastStatus: "PENDING" | "SENT" | "DELIVERED" | "FAILED";
  lastAt: string;
  family: { id: string; name: string; primaryPhone: string | null; primaryEmail: string | null } | null;
};

export async function listInboxConversations(): Promise<InboxConversation[]> {
  await requireAdmin();

  const conversations = await prisma.conversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      family: { select: { id: true, name: true, primaryPhone: true, primaryEmail: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return conversations
    .map((c) => {
      const latest = c.messages[0];
      if (!latest) return null;
      return {
        id: c.id,
        phoneNumber: c.phoneNumber,
        lastBody: latest.body,
        lastDirection: latest.direction,
        lastStatus: latest.status,
        lastAt: latest.createdAt.toISOString(),
        family: c.family,
      };
    })
    .filter(Boolean) as InboxConversation[];
}

export type ConversationMessage = {
  id: string;
  createdAt: string;
  direction: "OUTBOUND" | "INBOUND";
  body: string;
  channel: "SMS" | "EMAIL";
  from: string | null;
  to: string | null;
  status: "PENDING" | "SENT" | "DELIVERED" | "FAILED";
  errorMessage?: string | null;
};

export async function loadConversation(conversationId: string): Promise<ConversationMessage[]> {
  await requireAdmin();
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return rows.map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    direction: m.direction,
    body: m.body,
    channel: m.channel,
    from: m.fromNumber ?? m.fromEmail ?? null,
    to: m.toNumber ?? m.toEmail ?? null,
    status: m.status,
    errorMessage: m.errorMessage,
  }));
}

export async function linkConversationToFamily(conversationId: string, familyId: string) {
  await requireAdmin();
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { familyId },
  });

  await prisma.message.updateMany({
    where: { conversationId },
    data: { familyId },
  });

  await supaServer.channel(inboxTopic).send({
    type: "broadcast",
    event: "inbox:updated",
    payload: { conversationId },
  });

  return conversation;
}

export async function sendToConversation({
  conversationId,
  body,
}: {
  conversationId: string;
  body: string;
}) {
  await requireAdmin();

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Message cannot be empty" } as const;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { family: true },
  });
  if (!conversation) return { ok: false, error: "Conversation not found" } as const;

  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM;
  if (!messagingServiceSid && !from) return { ok: false, error: "Missing Twilio configuration" } as const;

  const message = await prisma.message.create({
    data: {
      direction: "OUTBOUND",
      channel: "SMS",
      body: trimmed,
      fromNumber: from ?? `msvc:${messagingServiceSid}`,
      toNumber: conversation.phoneNumber,
      status: "PENDING",
      conversationId: conversation.id,
      familyId: conversation.familyId,
    },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  try {
    const client = getTwilioClient();
    const msg = await client.messages.create({
      to: conversation.phoneNumber,
      body: trimmed,
      ...(messagingServiceSid ? { messagingServiceSid } : { from }),
      ...(process.env.TWILIO_STATUS_CALLBACK ? { statusCallback: process.env.TWILIO_STATUS_CALLBACK } : {}),
    });

    await prisma.message.update({ where: { id: message.id }, data: { status: "SENT", providerSid: msg.sid } });
    await supaServer.channel(convoTopic(conversation.id)).send({
      type: "broadcast",
      event: "message:new",
      payload: {
        id: message.id,
        body: trimmed,
        direction: "OUTBOUND",
        status: "SENT",
        createdAt: message.createdAt,
      },
    });
    await supaServer.channel(inboxTopic).send({
      type: "broadcast",
      event: "inbox:updated",
      payload: { conversationId: conversation.id },
    });

    return { ok: true, id: message.id } as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "FAILED", errorCode: String(e?.code ?? ""), errorMessage: e?.message ?? "" },
    });
    return { ok: false, error: e?.message ?? "Failed to send" } as const;
  }
}
