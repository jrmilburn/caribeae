"use server";

import { requireAdmin } from "@/lib/requireAdmin";
import { updateClassInstanceTimes } from "@/server/classInstance/updateClassInstanceTimes";

type MovePayload = {
  id: string;
  startTime: string | Date;
  endTime: string | Date;
};

export async function moveClassInstanceAction(payload: MovePayload) {
  await requireAdmin();

  const start = new Date(payload.startTime);
  const end = new Date(payload.endTime);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid dates provided");
  }
  if (start >= end) {
    throw new Error("startTime must be before endTime");
  }

  return updateClassInstanceTimes({
    id: payload.id,
    startTime: start,
    endTime: end,
  });
}
