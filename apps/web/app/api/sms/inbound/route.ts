import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supaServer, inboxTopic, convoTopic } from "@/lib/realtime/supabase-server";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();            // important: raw body for signature check

  // Twilio posts application/x-www-form-urlencoded
  const params = new URLSearchParams(rawBody);
  const from = params.get("From")!;        // +61...
  const to = params.get("To")!;            // your AU number
  const body = params.get("Body") || "";
  const messageSid = params.get("MessageSid") || "";

  // Optional: handle STOP/UNSUB
  if (/^\s*stop\s*$/i.test(body)) {
    await prisma.client.updateMany({ where: { phone: from }, data: { smsOptIn: false } });
    return NextResponse.json({ ok: true });
  }

  // Find thread/client by phone and store message
  const client = await prisma.client.findFirst({ where: { phone: from }, select: { id: true } });
  const created = await prisma.message.create({
    data: {
      direction: "INBOUND",
      body,
      fromNumber: from,
      toNumber: to,
      providerSid: messageSid,
      clientId: client?.id ?? null,
    }
  });

  await supaServer.channel(convoTopic(client?.id ?? "unknown")).send({
  type: "broadcast",
  event: "message:new",
  payload: {
    id: created.id,
    body,
    fromNumber: from,
    toNumber: to,
    direction: "INBOUND",
    status: "DELIVERED",
    createdAt: created.createdAt, // Date
  },
});

await supaServer.channel(inboxTopic).send({
  type: "broadcast",
  event: "inbox:updated",
  payload: { clientId: client?.id ?? null },
});

  return NextResponse.json({ ok: true });
}


