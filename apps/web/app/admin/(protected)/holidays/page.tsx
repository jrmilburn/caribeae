import { requireAdmin } from "@/lib/requireAdmin";
import { getLevels } from "@/server/level/getLevels";
import getClassTemplates from "@/server/classTemplate/getClassTemplates";
import HolidaysPageClient from "./HolidaysPageClient";
import { listHolidays } from "@/server/holiday/listHolidays";
import { parsePaginationSearchParams } from "@/server/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export default async function HolidaysPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await Promise.resolve(searchParams ?? {});
  const { pageSize, cursor } = parsePaginationSearchParams(sp);

  const [holidays, levels, templates] = await Promise.all([
    listHolidays({ pageSize, cursor }),
    getLevels(),
    getClassTemplates(),
  ]);

  return (
    <HolidaysPageClient
      holidays={holidays.items}
      totalCount={holidays.totalCount}
      nextCursor={holidays.nextCursor}
      pageSize={pageSize}
      levels={levels}
      templates={templates}
    />
  );
}
