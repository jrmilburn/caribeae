import "server-only";

export type EmailRecipient = { email: string; name?: string | null; familyId?: string | null };

type SendEmailPayload = {
  to: EmailRecipient[];
  subject: string;
  html: string;
  from?: { email: string; name?: string };
  preheader?: string | null;
};

const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";

async function postSendgrid(body: unknown) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("Missing SENDGRID_API_KEY");

  const res = await fetch(SENDGRID_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SendGrid error ${res.status}: ${text}`);
  }
}

export async function sendSingleEmail(payload: SendEmailPayload) {
  const fromEmail = payload.from?.email ?? process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) throw new Error("Missing SENDGRID_FROM_EMAIL");

  const personalizations = payload.to.map((recipient) => ({
    to: [{ email: recipient.email, name: recipient.name || undefined }],
  }));

  const requestBody = {
    personalizations,
    from: { email: fromEmail, name: payload.from?.name || process.env.SENDGRID_FROM_NAME || undefined },
    subject: payload.subject,
    content: [{ type: "text/html", value: payload.html }],
    ...(payload.preheader ? { headers: { "X-Preheader": payload.preheader } } : {}),
  };

  await postSendgrid(requestBody);
}

export async function sendEmailBroadcast(params: {
  subject: string;
  preheader?: string;
  html: string;
  recipients: EmailRecipient[];
}) {
  if (!params.recipients.length) return { total: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const recipient of params.recipients) {
    try {
      await sendSingleEmail({
        subject: params.subject,
        preheader: params.preheader,
        html: params.html,
        to: [recipient],
      });
      sent += 1;
    } catch (e) {
      console.error("sendgrid error", e);
      failed += 1;
    }
  }

  return { total: params.recipients.length, sent, failed };
}
