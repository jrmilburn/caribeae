import { PageHeaderLoading, PageLoading } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageLoading label="Loading enrolment plans" header={<PageHeaderLoading withMeta withAction />}>
      <div className="rounded-xl border bg-card p-4 sm:p-6">
        <Skeleton className="h-5 w-28" />
        <div className="mt-4 overflow-hidden rounded-lg border">
          <table className="min-w-full divide-y divide-border">
            <thead>
              <tr>
                {Array.from({ length: 6 }).map((_, index) => (
                  <th key={index} className="px-4 py-3 text-left">
                    <Skeleton className="h-3.5 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: 7 }).map((_, row) => (
                <tr key={row}>
                  {Array.from({ length: 6 }).map((__, column) => (
                    <td key={column} className="px-4 py-4">
                      <Skeleton className={column === 5 ? "h-4 w-8" : "h-3.5 w-24"} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageLoading>
  );
}
