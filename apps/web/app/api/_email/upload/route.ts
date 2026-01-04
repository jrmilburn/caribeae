import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

const BUCKET = "email-assets"; // create this as public in Supabase Storage

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;

  if (!file) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const key = `uploads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error } = await supa.storage.from(BUCKET).upload(key, Buffer.from(arrayBuffer), {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: pub } = supa.storage.from(BUCKET).getPublicUrl(key);
  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
