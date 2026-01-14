import { getLevels } from "@/server/level/getLevels";
import FamilyList from "./FamilyList";
import { listFamilies } from "@/server/family/listFamilies";
import { parsePaginationSearchParams } from "@/server/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export default async function FamilyPage({ searchParams }: PageProps) {
  const sp = await Promise.resolve(searchParams ?? {});
  const { q, pageSize, cursor } = parsePaginationSearchParams(sp);
  const levelId = typeof sp.levelId === "string" ? sp.levelId : null;

  const [families, levels] = await Promise.all([
    listFamilies({ q, pageSize, cursor, levelId }),
    getLevels(),
  ]);

  return (
    <div className="">
      <FamilyList
        families={families.items}
        levels={levels}
        totalCount={families.totalCount}
        nextCursor={families.nextCursor}
        pageSize={pageSize}
      />
    </div>
  );
}
