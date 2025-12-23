import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/requireAdmin";
import { updateClassInstanceTimes } from "@/server/classInstance/updateClassInstanceTimes";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  await requireAdmin();

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "Missing class instance id" }, { status: 400 });
  }

  const body = (await request.json()) as {
    startTime?: string;
    endTime?: string;
  };

  const startTime = body.startTime ? new Date(body.startTime) : null;
  const endTime = body.endTime ? new Date(body.endTime) : null;

  if (!startTime || !endTime || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return NextResponse.json({ error: "startTime and endTime are required ISO dates" }, { status: 400 });
  }

  if (startTime >= endTime) {
    return NextResponse.json({ error: "startTime must be before endTime" }, { status: 400 });
  }

  const classInstance = await updateClassInstanceTimes({
    id,
    startTime,
    endTime,
  });

  return NextResponse.json({ classInstance });
}
