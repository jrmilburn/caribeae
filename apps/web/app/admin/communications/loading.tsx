// app/(protected)/admin/communications/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function ChipSkeleton() {
  return <Skeleton className="h-6 w-16 rounded-full" />;
}

function RowSkeleton() {
  return (
    <TableRow>
      {/* Type */}
      <TableCell className="w-40">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3 w-28" />
        </div>
      </TableCell>

      {/* Subject */}
      <TableCell>
        <div className="space-y-2">
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-4 w-[55%]" />
        </div>
      </TableCell>

      {/* Recipient */}
      <TableCell className="w-40">
        <Skeleton className="h-4 w-28" />
      </TableCell>

      {/* Status */}
      <TableCell className="w-28">
        <Skeleton className="h-6 w-20 rounded-full" />
      </TableCell>

      {/* Sent */}
      <TableCell className="w-44">
        <Skeleton className="h-4 w-32" />
      </TableCell>
    </TableRow>
  );
}

export default function Loading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-3 w-72" />

        {/* Filters row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ChipSkeleton />
          <ChipSkeleton />
          <ChipSkeleton />
          <ChipSkeleton />
          <ChipSkeleton />
          <ChipSkeleton />
          <ChipSkeleton />
          <ChipSkeleton />
          <ChipSkeleton />
          <Skeleton className="ml-2 h-3 w-20" /> {/* Clear filters */}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="bg-card">
          <Table className="p-0">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="w-40">Recipient</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-44">Sent</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {Array.from({ length: 10 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
