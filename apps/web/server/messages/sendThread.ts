// 'use server'
import twilio from "twilio"
import { prisma } from "@/lib/prisma"

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)

export async function sendToClient({
  clientId,
  to,                        // E.164
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
  })

  try {
    const msg = await client.messages.create({
      to,
      body,
      ...(process.env.TWILIO_MESSAGING_SERVICE_SID
        ? { messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID }
        : { from: process.env.TWILIO_FROM }),
      ...(process.env.TWILIO_STATUS_CALLBACK ? { statusCallback: process.env.TWILIO_STATUS_CALLBACK } : {}),
    })

    await prisma.message.update({ where: { id: rec.id }, data: { status: "SENT", providerSid: msg.sid } })
    return { ok: true, id: rec.id }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    await prisma.message.update({
      where: { id: rec.id },
      data: { status: "FAILED", errorCode: String(e?.code ?? ""), errorMessage: e?.message ?? "", failedAt: new Date() },
    })
    return { ok: false, error: e?.message }
  }
}
