"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import twilio from "twilio";

type SendInput = {
  name?: string;
  body?: string;
  message?: string;
  recipients: string[];
  createdById?: string;
  familyId?: string;
};

type SendResult = {
  to: string;
  ok: boolean;
  sid?: string;
  errorCode?: string | number;
  errorMessage?: string;
  conversationId?: string;
};

type SendResponse =
  | {
      ok: true;
      campaignId: string;
      summary: { total: number; sent: number; failed: number };
      results: SendResult[];
    }
  | {
      ok: false;
      error: string;
    };

async function findConversationForNumber(to: string, fallbackFamilyId?: string) {
  const existing = await prisma.conversation.findUnique({ where: { phoneNumber: to } });
  if (existing) {
    await prisma.conversation.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
    return existing;
  }

  const family =
    fallbackFamilyId
      ? await prisma.family.findUnique({ where: { id: fallbackFamilyId } })
      : await prisma.family.findFirst({
          where: { OR: [{ primaryPhone: to }, { secondaryPhone: to }] },
        });

  return prisma.conversation.create({
    data: {
      phoneNumber: to,
      familyId: family?.id ?? null,
    },
  });
}

export async function sendSmsAction(input: SendInput): Promise<SendResponse> {
  await requireAdmin();

  const text = (input.body ?? input.message ?? "").trim();
  if (!text) return { ok: false, error: "Missing message/body" };
  const recipients = Array.from(new Set((input.recipients ?? []).map((r) => r.trim()).filter(Boolean)));
  if (recipients.length === 0) return { ok: false, error: "No recipients" };

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return { ok: false, error: "Missing Twilio credentials" };

  const client = twilio(accountSid, authToken);
  const svc = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM;
  if (!svc && !from) return { ok: false, error: "Missing TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM" };

  const campaign = await prisma.campaign.create({
    data: { name: input.name ?? `Broadcast ${new Date().toISOString()}`, body: text, createdById: input.createdById },
  });

  const queue = [...recipients];
  const CONCURRENCY = 10;
  const results: SendResult[] = [];

  async function worker() {
    while (queue.length) {
      const to = queue.shift()!;
      const conversation = await findConversationForNumber(to, input.familyId);

      const rec = await prisma.message.create({
        data: {
          direction: "OUTBOUND",
          channel: "SMS",
          body: text,
          fromNumber: from ?? `msvc:${svc!}`,
          toNumber: to,
          status: "PENDING",
          conversationId: conversation.id,
          familyId: conversation.familyId,
          campaignId: campaign.id,
        },
      });

      try {
        const msg = await client.messages.create({
          to,
          body: text,
          ...(svc ? { messagingServiceSid: svc } : { from }),
          ...(process.env.TWILIO_STATUS_CALLBACK ? { statusCallback: process.env.TWILIO_STATUS_CALLBACK } : {}),
        });

        await prisma.message.update({
          where: { id: rec.id },
          data: { status: "SENT", providerSid: msg.sid },
        });

        results.push({ to, ok: true, sid: msg.sid, conversationId: conversation.id });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        await prisma.message.update({
          where: { id: rec.id },
          data: {
            status: "FAILED",
            errorCode: String(e?.code ?? e?.status ?? ""),
            errorMessage: e?.message ?? "",
            failedAt: new Date(),
          },
        });
        results.push({ to, ok: false, errorCode: e?.code ?? e?.status, errorMessage: e?.message, conversationId: conversation.id });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()));

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  return {
    ok: true,
    campaignId: campaign.id,
    summary: { total: results.length, sent, failed },
    results,
  };
}
