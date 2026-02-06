import { getLevels } from "@/server/level/getLevels";
import FamilyList from "./FamilyList";
import { listFamilies } from "@/server/family/listFamilies";
import type { FamilyListEntry } from "@/server/family/listFamilies";
import type { StudentListEntry } from "@/server/student/listStudents";
import { parsePaginationSearchParams } from "@/server/pagination";
import { listStudents } from "@/server/student/listStudents";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export default async function FamilyPage({ searchParams }: PageProps) {
  const sp = await Promise.resolve(searchParams ?? {});
  const { q, pageSize, cursor } = parsePaginationSearchParams(sp);
  const levelId = typeof sp.levelId === "string" ? sp.levelId : null;
  const view = sp.view === "students" ? "students" : "families";

  const levels = await getLevels();
  let totalCount = 0;
  let nextCursor: string | null = null;
  let families: FamilyListEntry[] = [];
  let students: StudentListEntry[] = [];

  if (view === "students") {
    const studentResult = await listStudents({ q, pageSize, cursor, levelId });
    totalCount = studentResult.totalCount;
    nextCursor = studentResult.nextCursor;
    students = studentResult.items;
  } else {
    const familyResult = await listFamilies({ q, pageSize, cursor, levelId });
    totalCount = familyResult.totalCount;
    nextCursor = familyResult.nextCursor;
    families = familyResult.items;
  }

  return (
    <div className="">
      <FamilyList
        view={view}
        families={families}
        students={students}
        levels={levels}
        totalCount={totalCount}
        nextCursor={nextCursor}
        pageSize={pageSize}
      />
    </div>
  );
}
