// app/api/sms/status/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { twilioValidateRequest } from "@/lib/twilio/validate"
import { supaServer, inboxTopic, convoTopic } from "@/lib/realtime/supabase-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const raw = await req.text()

  // Twilio signature validation against the exact public URL this endpoint is mounted at
  const sig = req.headers.get("x-twilio-signature") || ""
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/status`
  if (!twilioValidateRequest(sig, url, raw)) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const p = new URLSearchParams(raw)
  const sid = p.get("MessageSid") || p.get("SmsSid") // Twilio sometimes sends SmsSid
  if (!sid) return NextResponse.json({ ok: true, ignored: "missing sid" })

  // Normalize status
  const s = (p.get("MessageStatus") || p.get("SmsStatus") || "").toLowerCase()
  // queued | sent | delivered | failed | undelivered | receiving | received | accepted | scheduled | canceled ...
  const patch: Record<string, unknown> = {}
  if (s === "delivered") {
    patch.status = "DELIVERED"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(patch as any).deliveredAt = new Date()
  } else if (s === "failed" || s === "undelivered") {
    patch.status = "FAILED"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(patch as any).failedAt = new Date()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(patch as any).errorCode = p.get("ErrorCode") || null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(patch as any).errorMessage = p.get("ErrorMessage") || null
  } else if (s === "sent" || s === "queued" || s === "accepted") {
    // mark progress states as SENT for your UI (optional)
    patch.status = "SENT"
  } else {
    // Ignore other intermediate states to reduce churn
    return NextResponse.json({ ok: true, ignored: s || "no-status" })
  }

  // Find the message so we can broadcast to the correct conversation
  const msg = await prisma.message.findFirst({
    where: { providerSid: sid },
    select: { id: true, clientId: true },
  })

  if (!msg) {
    // Nothing to update; still OK (Twilio can retry weirdly/out-of-order)
    return NextResponse.json({ ok: true, ignored: "no-message" })
  }

  await prisma.message.update({
    where: { id: msg.id },
    data: patch,
  })

  // Realtime broadcasts (best-effort; don't block response)
  try {
    if (msg.clientId) {
      // Notify the open thread to refresh statuses
      await supaServer.channel(convoTopic(msg.clientId)).send({
        type: "broadcast",
        event: "message:update",
        payload: {
          id: msg.id,
          providerSid: sid,
          status: patch.status,
        },
      })
      // Nudge inbox list (last message/status ordering)
      await supaServer.channel(inboxTopic).send({
        type: "broadcast",
        event: "inbox:updated",
        payload: { clientId: msg.clientId },
      })
    }
  } catch (e) {
    console.error("[sms/status] broadcast error", e)
  }

  return NextResponse.json({ ok: true })
}
