import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "../../communications/CommunicationsTable";
import { getCommunication } from "@/server/communication/getCommunication";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function CommunicationDetailPage({
  params,
}: {
  params: { id: string };
}) {

  const { id } = await params;

  const communication = await getCommunication(id);
  if (!communication) return notFound();

  return (
    <div className="space-y-4 p-4 h-screen overflow-y-auto">
      <div className="text-sm text-muted-foreground">
        <Link href="/admin/communications" className="hover:underline">
          ← Back to communications
        </Link>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{communication.channel}</Badge>
            <Badge variant="outline">{communication.direction}</Badge>
            <StatusBadge status={communication.status} />
          </div>

          <CardTitle className="text-lg font-semibold">
            {communication.subject || "Message"}
          </CardTitle>

          <div className="text-sm text-muted-foreground">
            Sent on {formatDateTime(communication.createdAt)}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">To</div>
              <div>{communication.to ?? "—"}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">From</div>
              <div>{communication.from ?? "—"}</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Family</div>
              {communication.family ? (
                <Link
                  href={`/admin/family/${communication.family.id}`}
                  className="hover:underline"
                >
                  {communication.family.name ?? "View family"}
                </Link>
              ) : (
                <div>—</div>
              )}
            </div>

            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <StatusBadge status={communication.status} />
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs text-muted-foreground">Body</div>
            <div className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
              {communication.body}
            </div>
          </div>

          {communication.errorMessage ? (
            <div className="text-sm text-destructive">
              Error: {communication.errorMessage}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
