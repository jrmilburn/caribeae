"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import type { AttendanceEntryDTO } from "@/app/admin/class/[id]/types";

export async function listAttendance({
  templateId,
  dateKey,
}: {
  templateId: string;
  dateKey: string;
}): Promise<AttendanceEntryDTO[]> {
  await getOrCreateUser();
  await requireAdmin();

  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error("Invalid date");
  }

  const rows = await prisma.attendance.findMany({
    where: { templateId, date },
    orderBy: [{ studentId: "asc" }],
  });

  return rows.map((row) => ({
    studentId: row.studentId,
    status: row.status,
    note: row.note ?? null,
  }));
}
