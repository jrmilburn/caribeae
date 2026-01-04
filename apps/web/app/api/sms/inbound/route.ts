import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supaServer, inboxTopic, convoTopic } from "@/lib/realtime/supabase-server";
import { twilioValidateRequest } from "@/lib/twilio/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findFamilyByPhone(phone: string) {
  return prisma.family.findFirst({
    where: { OR: [{ primaryPhone: phone }, { secondaryPhone: phone }] },
    select: { id: true },
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const signature = req.headers.get("x-twilio-signature") || "";
  const url = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/sms/inbound`
    : req.url;

  // ✅ Twilio expects form params (object), not raw string
  const urlParams = new URLSearchParams(rawBody);
  const paramsObj: Record<string, string> = {};
  urlParams.forEach((value, key) => {
    paramsObj[key] = value;
  });

  if (!twilioValidateRequest(signature, url, paramsObj)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // You can keep using urlParams below
  const from = urlParams.get("From") || "";
  const to = urlParams.get("To") || "";
  const body = urlParams.get("Body") || "";
  const messageSid = urlParams.get("MessageSid") || "";

  if (!from) return NextResponse.json({ ok: false, error: "Missing sender" }, { status: 400 });

  if (/^\s*stop\s*$/i.test(body)) {
    await prisma.conversation.updateMany({
      where: { phoneNumber: from },
      data: { updatedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  const family = await findFamilyByPhone(from);
  const conversation = await prisma.conversation.upsert({
    where: { phoneNumber: from },
    update: { ...(family?.id ? { familyId: family.id } : {}), updatedAt: new Date() },
    create: { phoneNumber: from, familyId: family?.id ?? null },
  });

  const created = await prisma.message.create({
    data: {
      direction: "INBOUND",
      channel: "SMS",
      body,
      fromNumber: from,
      toNumber: to,
      providerSid: messageSid,
      conversationId: conversation.id,
      familyId: conversation.familyId,
      status: "DELIVERED",
    },
  });

  await supaServer.channel(convoTopic(conversation.id)).send({
    type: "broadcast",
    event: "message:new",
    payload: {
      id: created.id,
      body,
      fromNumber: from,
      toNumber: to,
      direction: "INBOUND",
      status: "DELIVERED",
      createdAt: created.createdAt,
    },
  });

  await supaServer.channel(inboxTopic).send({
    type: "broadcast",
    event: "inbox:updated",
    payload: { conversationId: conversation.id },
  });

  return NextResponse.json({ ok: true });
}
