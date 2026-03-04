import {
  PageHeaderLoading,
  PageLoading,
} from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageLoading label="Loading billing" header={<PageHeaderLoading withAction={false} />}>
      <div className="space-y-6">
        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <Skeleton className="h-5 w-40" />
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
                        <Skeleton className={column === 5 ? "h-3.5 w-12" : "h-3.5 w-24"} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
