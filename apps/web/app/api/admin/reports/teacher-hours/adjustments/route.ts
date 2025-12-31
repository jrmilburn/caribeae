import { NextResponse } from "next/server";

import { exportTeacherAdjustmentsCsv } from "@/server/reports/teacherHours/exports";
import { parseDateParam } from "@/server/reports/filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const filters = {
    from: parseDateParam(search.get("from") ?? undefined) ?? undefined,
    to: parseDateParam(search.get("to") ?? undefined) ?? undefined,
  };
  const { filename, content } = await exportTeacherAdjustmentsCsv(filters);

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
