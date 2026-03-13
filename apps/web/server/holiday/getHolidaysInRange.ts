import { prisma } from "@/lib/prisma";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

export async function getHolidaysInRange(params: { from: Date; to: Date }) {
  const from = brisbaneStartOfDay(params.from);
  const to = brisbaneStartOfDay(params.to);

  return prisma.holiday.findMany({
    where: {
      startDate: { lte: to },
      endDate: { gte: from },
    },
    orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
  });
}
