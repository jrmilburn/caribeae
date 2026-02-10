import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CommunicationSummary } from "@/server/communication/listCommunications";
function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusBadge({ status }: { status: CommunicationSummary["status"] }) {
  const variant =
    status === "FAILED" ? "destructive" : status === "PENDING" ? "secondary" : "default";

  return <Badge variant={variant}>{status}</Badge>;
}

export function CommunicationsTable({ communications }: { communications: CommunicationSummary[] }) {
  if (!communications.length) {
    return <p className="text-sm text-muted-foreground">No communications yet.</p>;
  }

  return (
    <div className="bg-card">
      <Table>
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
          {communications.map((comm) => (
            <TableRow key={comm.id}>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant="secondary">{comm.channel}</Badge>
                  <Badge variant="outline">{comm.direction}</Badge>
                </div>
                {comm.family ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {comm.family.name ?? "Unnamed family"}
                  </div>
                ) : null}
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/communication/${comm.id}`}
                  className="line-clamp-2 font-medium hover:underline"
                >
                  {comm?.subject}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {comm.to ?? "—"}
              </TableCell>
              <TableCell>
                <StatusBadge status={comm.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {formatDateTime(comm.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export { StatusBadge };
