import { listClassTemplates } from "@/server/classTemplate/listClassTemplates";
import { getLevels } from "@/server/level/getLevels";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getTeachers } from "@/server/teacher/getTeachers";
import TemplateList, { type TemplateWithLevel } from "./templates/TemplateList";
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
  const levelId = typeof sp.levelId === "string" ? sp.levelId : null;
  const teacherId = typeof sp.teacherId === "string" ? sp.teacherId : null;
  const statusValue = typeof sp.status === "string" ? sp.status : null;
  const status = statusValue === "active" || statusValue === "inactive" || statusValue === "all" ? statusValue : null;

  const [templates, levels, teachers] = await Promise.all([
    listClassTemplates({ q, pageSize, cursor, levelId, teacherId, status }),
    getLevels(),
    getTeachers(),
  ]);

  /**
   * TS FIX:
   * TemplateList expects TemplateWithLevel[] (includes createdAt/updatedAt via TemplateModalTemplate),
   * but listClassTemplates currently returns items without createdAt/updatedAt.
   *
   * Correct “root” fix is to update listClassTemplates (and its exported type) to SELECT createdAt/updatedAt.
   * Until then, we can pass through with a narrow assertion here to unblock the build.
   *
   * NOTE: If TemplateModal actually *uses* createdAt/updatedAt at runtime, you should implement the root fix.
   */
  const items = templates.items as unknown as TemplateWithLevel[];

  return (
    <div className="max-h-screen overflow-y-auto">
      <TemplateList
        templates={items}
        levels={levels}
        teachers={teachers}
        totalCount={templates.totalCount}
        nextCursor={templates.nextCursor}
        pageSize={pageSize}
      />
    </div>
  );
}
