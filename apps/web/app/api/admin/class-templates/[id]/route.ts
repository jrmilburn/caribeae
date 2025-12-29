import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { prisma } from "@/lib/prisma";
import { differenceInMinutes } from "date-fns";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  await requireAdmin();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing template id" }, { status: 400 });

  const body = (await request.json()) as { startTime?: string; endTime?: string };
  if (!body.startTime || !body.endTime)
    return NextResponse.json({ error: "startTime and endTime are required" }, { status: 400 });

  const start = new Date(body.startTime);
  const end = new Date(body.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid timestamps" }, { status: 400 });
  }

  const dayOfWeek = ((start.getDay() + 6) % 7); // convert JS Sunday=0 to Monday=0
  const durationMin = Math.max(0, differenceInMinutes(end, start));
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = startMinutes + durationMin;

  const updated = await prisma.classTemplate.update({
    where: { id },
    data: {
      dayOfWeek,
      startTime: startMinutes,
      endTime: endMinutes,
    },
    include: { level: true, teacher: true },
  });

  return NextResponse.json({ template: updated });
}
