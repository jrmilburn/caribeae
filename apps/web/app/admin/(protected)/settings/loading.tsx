import { LoadingRegion } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion className="space-y-6" label="Loading settings">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full sm:w-72" />
          <div className="overflow-hidden rounded-lg border">
            <table className="min-w-full divide-y divide-border">
              <thead>
                <tr>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <th key={index} className="px-4 py-3 text-left">
                      <Skeleton className="h-3.5 w-16" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from({ length: 7 }).map((_, row) => (
                  <tr key={row}>
                    {Array.from({ length: 5 }).map((__, column) => (
                      <td key={column} className="px-4 py-4">
                        <Skeleton className={column === 4 ? "h-4 w-8" : "h-3.5 w-24"} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
