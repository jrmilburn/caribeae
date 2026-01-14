import { listClassTemplates } from "@/server/classTemplate/listClassTemplates";
import { getLevels } from "@/server/level/getLevels";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeachers } from "@/server/teacher/getTeachers";
import TemplateList from "./templates/TemplateList";
import { parsePaginationSearchParams } from "@/server/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export default async function AdminClassesPage({ searchParams }: PageProps) {
  await getOrCreateUser();
  await requireAdmin();

  const sp = await Promise.resolve(searchParams ?? {});
  const { q, pageSize, cursor } = parsePaginationSearchParams(sp);

  const [templates, levels, teachers] = await Promise.all([
    listClassTemplates({ q, pageSize, cursor }),
    getLevels(),
    getTeachers(),
  ]);

  return (
    <div className="max-h-screen overflow-y-auto">
      <TemplateList
        templates={templates.items}
        levels={levels}
        teachers={teachers}
        totalCount={templates.totalCount}
        nextCursor={templates.nextCursor}
        pageSize={pageSize}
      />
    </div>
  );
}
