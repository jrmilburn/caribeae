// /app/admin/class/[id]/page.tsx
import { getClassPageData } from "@/server/class/getClassPageData";

import ClassPageClient from "./ClassPageClient";

type PageProps = {
  params: { id: string };
  searchParams?: { date?: string; tab?: string };
};

export default async function ClassPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const search = await searchParams;
  const pageData = await getClassPageData(id, search?.date);
  if (!pageData) return null;

  return (
    <div className="h-full overflow-y-auto">
      <ClassPageClient
        data={pageData}
        requestedDateKey={search?.date ?? null}
        initialTab={search?.tab ?? null}
      />
    </div>
  );
}
