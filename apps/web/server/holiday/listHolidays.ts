import { prisma } from "@/lib/prisma";
import type { Holiday } from "@prisma/client";

export type HolidayListItem = Pick<
  Holiday,
  "id" | "name" | "startDate" | "endDate" | "note" | "levelId" | "templateId"
>;

export async function listHolidays(params: {
  pageSize: number;
  cursor?: string | null;
}) {
  const [totalCount, holidays] = await prisma.$transaction([
    prisma.holiday.count(),
    prisma.holiday.findMany({
      orderBy: [{ startDate: "desc" }, { endDate: "desc" }, { id: "desc" }],
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      take: params.pageSize + 1,
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        note: true,
        levelId: true,
        templateId: true,
      },
    }),
  ]);

  const hasNext = holidays.length > params.pageSize;
  const items = hasNext ? holidays.slice(0, params.pageSize) : holidays;
  const nextCursor = hasNext ? items[items.length - 1]?.id ?? null : null;

  return {
    items,
    totalCount,
    nextCursor,
  };
}
