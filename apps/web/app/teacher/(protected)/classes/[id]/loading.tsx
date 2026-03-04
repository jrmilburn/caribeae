import { LoadingRegion } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion className="space-y-4" label="Loading teacher class view">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              {Array.from({ length: 4 }).map((_, index) => (
                <th key={index} className="px-4 py-3 text-left">
                  <Skeleton className="h-3.5 w-16" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {Array.from({ length: 10 }).map((_, row) => (
              <tr key={row}>
                <td className="px-4 py-4">
                  <Skeleton className="h-3.5 w-40" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-3.5 w-24" />
                </td>
                <td className="px-4 py-4">
                  <Skeleton className="h-3.5 w-20" />
                </td>
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-20 rounded-md" />
                    <Skeleton className="h-8 w-20 rounded-md" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LoadingRegion>
  );
}
