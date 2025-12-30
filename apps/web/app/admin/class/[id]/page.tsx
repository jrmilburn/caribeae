// /app/admin/class/[id]/page.tsx
import { getClassPageData } from "@/server/class/getClassPageData";

import ClassPageClient from "./ClassPageClient";

type PageProps = {
  params: { id: string };
  searchParams?: { date?: string; tab?: string };
};

export default async function ClassPage({ params, searchParams }: PageProps) {
  const { id } = params;

  const pageData = await getClassPageData(id, searchParams?.date);
  if (!pageData) return null;

  return (
    <div className="max-h-screen overflow-y-auto">
      <ClassPageClient
        data={pageData}
        requestedDateKey={searchParams?.date ?? null}
        initialTab={searchParams?.tab ?? null}
      />
    </div>
  );
}
