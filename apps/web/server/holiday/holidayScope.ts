import type { Prisma } from "@prisma/client";

export function buildHolidayScopeWhere(params: {
  templateIds?: Array<string | null | undefined>;
  levelIds?: Array<string | null | undefined>;
}): Prisma.HolidayWhereInput {
  const templateIds = (params.templateIds ?? []).filter((id): id is string => Boolean(id));
  const levelIds = (params.levelIds ?? []).filter((id): id is string => Boolean(id));

  const scope: Prisma.HolidayWhereInput[] = [{ levelId: null, templateId: null }];

  if (templateIds.length) {
    scope.push({ templateId: { in: templateIds } });
  }

  if (levelIds.length) {
    scope.push({ levelId: { in: levelIds } });
  }

  return { OR: scope };
}
