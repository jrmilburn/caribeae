import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";
import { getTemplateOccurrences } from "@/server/classTemplate/getTemplateOccurrences";
import { safeParseDateParam } from "@/server/schedule/rangeUtils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const levelId = searchParams.get("levelId");
  const makeupOnly = searchParams.get("makeupOnly") === "1";

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const fromDate = safeParseDateParam(fromParam);
  const toDate = safeParseDateParam(toParam);

  if (!fromDate || !toDate) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const classes = await getTemplateOccurrences({
    from: fromDate,
    to: toDate,
    levelId: levelId ?? undefined,
    makeupOnly,
  });

  return NextResponse.json({ classes });
}
