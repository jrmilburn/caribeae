import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { requireAdmin } from "@/lib/requireAdmin";
import { getClientIp } from "@/server/auth/getClientIp";
import { checkRateLimit } from "@/server/security/rateLimit";

export const runtime = "nodejs";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

const BUCKET = "email-assets"; // create this as public in Supabase Storage
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ip = await getClientIp();
  const rateLimit = checkRateLimit(`email-upload:${ip}`, {
    max: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;

  if (!file) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large" }, { status: 413 });
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: "Unsupported file type" }, { status: 415 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ ok: false, error: "Unsupported file extension" }, { status: 400 });
  }
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
