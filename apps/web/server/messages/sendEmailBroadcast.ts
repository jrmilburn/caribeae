"use server";

import { prisma } from "@/lib/prisma";
import { sendEmailBroadcast, type EmailRecipient } from "@/lib/server/email/sendgrid";
import { auth } from "@clerk/nextjs/server"; // or your auth util
import { requireAdmin } from "@/lib/requireAdmin";
import { Prisma } from "@prisma/client";

export async function sendEmailBroadcastAction(input: {
  subject: string;
  preheader?: string;
  html: string;
  recipients: EmailRecipient[]; // deduped!
  meta?: Prisma.InputJsonValue;
}) {
  await requireAdmin();
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Unauthorized" };

  if (!input.subject?.trim()) return { ok: false, error: "Subject required" };
  if (!input.html?.trim()) return { ok: false, error: "Email body required" };
  if (!input.recipients?.length) return { ok: false, error: "No recipients" };

  // de-dupe by email
  const seen = new Set<string>();
  const recipients = input.recipients.filter((r) => {
    const key = r.email.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const summary = await sendEmailBroadcast({
    subject: input.subject.trim(),
    preheader: input.preheader?.trim(),
    html: input.html,
    recipients,
  });

  if (recipients.length) {
    const now = new Date();
    const messages = recipients.map((r) => ({
      direction: "OUTBOUND" as const,
      channel: "EMAIL" as const,
      body: input.html,
      subject: input.subject.trim(),
      fromEmail: process.env.SENDGRID_FROM_EMAIL ?? null,
      toEmail: r.email,
      status: summary.failed > 0 ? "PENDING" : "SENT",
      familyId: r.familyId ?? null,
      createdAt: now,
    }));
    await prisma.message.createMany({ data: messages });
  }

  await prisma.emailCampaign.create({
    data: {
      createdById: userId,
      subject: input.subject.trim(),
      preheader: input.preheader?.trim(),
      html: input.html,
      total: summary.total,
      sent: summary.sent,
      failed: summary.failed,
      ...(input.meta !== undefined ? { meta: input.meta } : {}),
    },
  });

  return { ok: true, summary };
}
