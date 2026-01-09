import { prisma } from "@/lib/prisma";
import { normalizeToLocalMidnight } from "@/lib/dateUtils";

export async function getHolidaysInRange(params: { from: Date; to: Date }) {
  const from = normalizeToLocalMidnight(params.from);
  const to = normalizeToLocalMidnight(params.to);

  return prisma.holiday.findMany({
    where: {
      startDate: { lte: to },
      endDate: { gte: from },
    },
    orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
  });
}
