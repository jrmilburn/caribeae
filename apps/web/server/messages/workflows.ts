"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { sendSmsAction } from "./sendSms";
import { sendEmailBroadcastAction } from "./sendEmailBroadcast";
import { sendSingleEmail, type EmailRecipient } from "@/lib/server/email/sendgrid";
import { InvoiceStatus, EnrolmentStatus, type Family } from "@prisma/client";

type Channel = "SMS" | "EMAIL";

function pickFamilyDestination(family: Family, channel: Channel) {
  if (channel === "SMS") {
    return family.primaryPhone || family.secondaryPhone || null;
  }
  return family.primaryEmail || family.secondaryEmail || null;
}

export type RecipientPreview = {
  familyId: string;
  familyName: string;
  destination: string | null;
};

export type BroadcastFilters = {
  levelIds?: string[];
  invoiceStatuses?: InvoiceStatus[];
  activeEnrolments?: boolean;
  classTemplateIds?: string[];
};

async function familiesFromFilters(filters: BroadcastFilters) {
  const familyIds = new Set<string>();

  if (filters.levelIds?.length) {
    const students = await prisma.student.findMany({
      where: { levelId: { in: filters.levelIds } },
      select: { familyId: true },
    });
    students.forEach((s) => familyIds.add(s.familyId));
  }

  if (filters.invoiceStatuses?.length) {
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: filters.invoiceStatuses } },
      select: { familyId: true },
    });
    invoices.forEach((i) => familyIds.add(i.familyId));
  }

  if (filters.activeEnrolments) {
    const enrolments = await prisma.enrolment.findMany({
      where: { status: EnrolmentStatus.ACTIVE },
      select: { student: { select: { familyId: true } } },
    });
    enrolments.forEach((e) => familyIds.add(e.student.familyId));
  }

  if (filters.classTemplateIds?.length) {
    const validTemplates = await prisma.classTemplate.findMany({
      where: { id: { in: filters.classTemplateIds } },
      select: { id: true },
    });
    const templateIds = validTemplates.map((t) => t.id);

    if (templateIds.length) {
      const enrolments = await prisma.enrolment.findMany({
        where: {
          templateId: { in: templateIds },
          ...(filters.activeEnrolments ? { status: EnrolmentStatus.ACTIVE } : {}),
        },
        select: { student: { select: { familyId: true } } },
      });
      enrolments.forEach((e) => familyIds.add(e.student.familyId));
    }
  }

  // If no filters were selected, default to all families to avoid empty broadcasts.
  if (!familyIds.size) {
    const allFamilies = await prisma.family.findMany({ select: { id: true } });
    allFamilies.forEach((f) => familyIds.add(f.id));
  }

  return prisma.family.findMany({
    where: { id: { in: Array.from(familyIds) } },
  });
}

export async function previewBroadcastRecipientsAction(input: {
  channel: Channel;
  filters: BroadcastFilters;
}) {
  await requireAdmin();

  const families = await familiesFromFilters(input.filters);
  const recipients: RecipientPreview[] = [];
  const skipped: RecipientPreview[] = [];

  families.forEach((family) => {
    const destination = pickFamilyDestination(family, input.channel);
    const preview = { familyId: family.id, familyName: family.name, destination };
    if (!destination) skipped.push(preview);
    else recipients.push(preview);
  });

  return { recipients, skipped };
}

export async function sendDirectMessageAction(input: {
  familyId: string;
  channel: Channel;
  body: string;
  subject?: string;
}) {
  await requireAdmin();

  const body = input.body.trim();
  if (!body) return { ok: false, error: "Message cannot be empty" } as const;

  const family = await prisma.family.findUnique({ where: { id: input.familyId } });
  if (!family) return { ok: false, error: "Family not found" } as const;

  const destination = pickFamilyDestination(family, input.channel);
  if (!destination) return { ok: false, error: "Family is missing contact details" } as const;

  if (input.channel === "SMS") {
    const res = await sendSmsAction({
      recipients: [destination],
      body,
      familyId: family.id,
      name: `Direct SMS to ${family.name}`,
    });
    return res;
  }

  // EMAIL
  try {
    await sendSingleEmail({
      subject: input.subject?.trim() || "Message from Admin",
      html: body,
      to: [{ email: destination, name: family.name, familyId: family.id }],
    });

    await prisma.message.create({
      data: {
        direction: "OUTBOUND",
        channel: "EMAIL",
        body,
        subject: input.subject?.trim() || "Message from Admin",
        fromEmail: process.env.SENDGRID_FROM_EMAIL ?? null,
        toEmail: destination,
        status: "SENT",
        familyId: family.id,
      },
    });

    return { ok: true } as const;
  } catch (e) {
    console.error("sendDirectMessageAction email error", e);
    await prisma.message.create({
      data: {
        direction: "OUTBOUND",
        channel: "EMAIL",
        body,
        subject: input.subject?.trim() || "Message from Admin",
        fromEmail: process.env.SENDGRID_FROM_EMAIL ?? null,
        toEmail: destination,
        status: "FAILED",
        familyId: family.id,
        errorMessage: e instanceof Error ? e.message : "Failed to send",
      },
    });
    return { ok: false, error: "Failed to send email" } as const;
  }
}

export async function sendBroadcastAction(input: {
  channel: Channel;
  body: string;
  subject?: string;
  filters: BroadcastFilters;
}) {
  await requireAdmin();

  const body = input.body.trim();
  if (!body) return { ok: false, error: "Message cannot be empty" } as const;

  const { recipients, skipped } = await previewBroadcastRecipientsAction({
    channel: input.channel,
    filters: input.filters,
  });

  if (!recipients.length) return { ok: false, error: "No recipients" } as const;

  if (input.channel === "SMS") {
    const res = await sendSmsAction({
      recipients: recipients.map((r) => r.destination!),
      body,
      name: "Broadcast SMS",
    });
    return { ...res, skipped };
  }

  const emailRecipients: EmailRecipient[] = recipients.map((r) => ({
    email: r.destination!,
    name: r.familyName,
    familyId: r.familyId,
  }));

  const res = await sendEmailBroadcastAction({
    subject: input.subject?.trim() || "Announcement",
    html: body,
    recipients: emailRecipients,
  });

  return { ...res, skipped };
}
