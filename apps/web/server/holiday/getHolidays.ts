import { prisma } from "@/lib/prisma";

export async function getHolidays() {
  return prisma.holiday.findMany({ orderBy: [{ startDate: "asc" }, { endDate: "asc" }] });
}
