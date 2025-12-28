import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSummary } from "@/server/dashboard/getDashboardSummary";
import { listCommunications } from "@/server/communication/listCommunications";

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const [summary, recentCommunications] = await Promise.all([
    getDashboardSummary(),
    listCommunications(5),
  ]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">
            At-a-glance metrics and recent communications.
          </p>
        </div>
        <Link href="/admin/communications" className="text-sm text-primary hover:underline">
          View all communications
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        <StatCard title="Families" value={summary.families} />
        <StatCard title="Students" value={summary.students} />
        <StatCard title="Active enrolments" value={summary.activeEnrolments} />
        <StatCard title="Outstanding invoices" value={summary.outstandingInvoices} />
        <StatCard title="Overdue invoices" value={summary.overdueInvoices} />
        <StatCard title="SMS (last 7 days)" value={summary.smsLast7Days} />
        <StatCard title="Emails (last 7 days)" value={summary.emailLast7Days} />
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Recent communications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentCommunications.length === 0 ? (
            <div className="text-sm text-muted-foreground">No communications yet.</div>
          ) : (
            <div className="space-y-3">
              {recentCommunications.map((comm) => (
                <div
                  key={comm.id}
                  className="flex flex-col gap-1 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Link
                      href={`/admin/communication/${comm.id}`}
                      className="font-medium hover:underline"
                    >
                      {comm.subject || comm.body || "Message"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {comm.channel} • {comm.direction} • {comm.to ?? "—"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(comm.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
