// app/api/sms/status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { twilioValidateRequest } from "@/lib/twilio/validate";
import { supaServer, inboxTopic, convoTopic } from "@/lib/realtime/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const raw = await req.text();

  const sig = req.headers.get("x-twilio-signature") || "";
  const url = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/status`
    : req.url;

  // ✅ Twilio expects params object (Record<string, any>), not raw string
  const p = new URLSearchParams(raw);
  const paramsObj: Record<string, string> = {};
  p.forEach((value, key) => {
    paramsObj[key] = value;
  });

  if (!twilioValidateRequest(sig, url, paramsObj)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sid = p.get("MessageSid") || p.get("SmsSid");
  if (!sid) return NextResponse.json({ ok: true, ignored: "missing sid" });

  const s = (p.get("MessageStatus") || p.get("SmsStatus") || "").toLowerCase();

  const patch: Record<string, unknown> = {};
  if (s === "delivered") {
    patch.status = "DELIVERED";
    (patch).deliveredAt = new Date();
  } else if (s === "failed" || s === "undelivered") {
    patch.status = "FAILED";
    (patch).failedAt = new Date();
    (patch).errorCode = p.get("ErrorCode") || null;
    (patch).errorMessage = p.get("ErrorMessage") || null;
  } else if (s === "sent" || s === "queued" || s === "accepted") {
    patch.status = "SENT";
  } else {
    return NextResponse.json({ ok: true, ignored: s || "no-status" });
  }

  const msg = await prisma.message.findFirst({
    where: { providerSid: sid },
    select: { id: true, conversationId: true },
  });

  if (!msg) {
    return NextResponse.json({ ok: true, ignored: "no-message" });
  }

  await prisma.message.update({
    where: { id: msg.id },
    data: patch,
  });

  try {
    if (msg.conversationId) {
      await supaServer.channel(convoTopic(msg.conversationId)).send({
        type: "broadcast",
        event: "message:update",
        payload: {
          id: msg.id,
          providerSid: sid,
          status: patch.status,
        },
      });

      await supaServer.channel(inboxTopic).send({
        type: "broadcast",
        event: "inbox:updated",
        payload: { conversationId: msg.conversationId },
      });
    }
  } catch (e) {
    console.error("[sms/status] broadcast error", e);
  }

  return NextResponse.json({ ok: true });
}
