import { listClassTemplates } from "@/server/classTemplate/listClassTemplates";

import TemplateList from "./TemplateList";
import { getLevels } from "@/server/level/getLevels";
import { getTeachers } from "@/server/teacher/getTeachers";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parsePaginationSearchParams } from "@/server/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export default async function ClassTemplates({ searchParams }: PageProps) {

    await getOrCreateUser()
    await requireAdmin()

    const sp = await Promise.resolve(searchParams ?? {});
    const { q, pageSize, cursor } = parsePaginationSearchParams(sp);

    const [templates, levels, teachers] = await Promise.all([
        listClassTemplates({ q, pageSize, cursor }),
        getLevels(),
        getTeachers(),
    ]);

    return (
        <div>
            <TemplateList 
                templates={templates.items}
                levels={levels}
                teachers={teachers}
                totalCount={templates.totalCount}
                nextCursor={templates.nextCursor}
                pageSize={pageSize}
            />
        </div>
    )

}
