'use server'
import { prisma } from "@/lib/prisma"
import twilio from "twilio"

type SendInput = {
  // allow both shapes:
  name?: string
  body?: string
  message?: string
  recipients: string[]        // E.164
  createdById?: string
}

type SendResult = {
  to: string
  ok: boolean
  sid?: string
  errorCode?: string | number
  errorMessage?: string
}

type SendResponse = {
  ok: true
  campaignId: string
  summary: { total: number; sent: number; failed: number }
  results: SendResult[]
} | {
  ok: false
  error: string
}

export async function sendSmsAction(input: SendInput): Promise<SendResponse> {
  const text = (input.body ?? input.message ?? "").trim()
  if (!text) return { ok: false, error: "Missing message/body" }
  const recipients = Array.from(new Set((input.recipients ?? []).map(r => r.trim()).filter(Boolean)))
  if (recipients.length === 0) return { ok: false, error: "No recipients" }

  const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
  const svc = process.env.TWILIO_MESSAGING_SERVICE_SID
  const from = process.env.TWILIO_FROM
  if (!svc && !from) return { ok: false, error: "Missing TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM" }

  const campaign = await prisma.campaign.create({
    data: { name: input.name ?? `Broadcast ${new Date().toISOString()}`, body: text, createdById: input.createdById },
  })

  const queue = [...recipients]
  const CONCURRENCY = 20
  const results: SendResult[] = []

  async function worker() {
    while (queue.length) {
      const to = queue.shift()!

      const clientRow = await prisma.client.findFirst({ where: { phone: to }, select: { id: true } })
      const rec = await prisma.message.create({
        data: {
          direction: "OUTBOUND",
          body: text,
          fromNumber: from ?? `msvc:${svc!}`,
          toNumber: to,
          status: "PENDING",
          clientId: clientRow?.id ?? null,
          campaignId: campaign.id,
        },
      })

      try {
        const msg = await client.messages.create({
          to,
          body: text,
          ...(svc ? { messagingServiceSid: svc } : { from }),
          ...(process.env.TWILIO_STATUS_CALLBACK ? { statusCallback: process.env.TWILIO_STATUS_CALLBACK } : {}),
        })

        await prisma.message.update({
          where: { id: rec.id },
          data: { status: "SENT", providerSid: msg.sid },
        })

        results.push({ to, ok: true, sid: msg.sid })
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
        })
        results.push({ to, ok: false, errorCode: e?.code ?? e?.status, errorMessage: e?.message })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()))

  const sent = results.filter(r => r.ok).length
  const failed = results.length - sent

  return {
    ok: true,
    campaignId: campaign.id,
    summary: { total: results.length, sent, failed },
    results,
  }
}
