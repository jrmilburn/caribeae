import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";
import { getTemplateOccurrences } from "@/server/classTemplate/getTemplateOccurrences";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const classes = await getTemplateOccurrences({ from: fromDate, to: toDate });

  return NextResponse.json({ classes });
}
