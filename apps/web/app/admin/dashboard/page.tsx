import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSummary } from "@/server/dashboard/getDashboardSummary";
import { listCommunications } from "@/server/communication/listCommunications";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

function buildHref(base: string, next: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

function StatCard({
  title,
  value,
  href,
}: {
  title: string;
  value: number;
  href: string;
}) {
  return (
    <Card className="group p-0">
      <Link
        href={href}
        className={cn(
          "block outline-none transition h-full p-4",
          "cursor-pointer",
          "hover:bg-muted/40 hover:shadow-md hover:-translate-y-[1px]",
          "active:translate-y-0 active:shadow-sm",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-hover:translate-x-0.5" />
          </div>
        </CardHeader>

        <CardContent>
          <div className="text-3xl font-semibold">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100">
            View details
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

export default async function DashboardPage() {
  const [summary, recentCommunications] = await Promise.all([
    getDashboardSummary(),
    listCommunications(5),
  ]);

  const commsBase = "/admin/communications";
  const smsHref = buildHref(commsBase, { channel: "SMS" });
  const emailHref = buildHref(commsBase, { channel: "EMAIL" });

  const stats = [
    { title: "Families", value: summary.families, href: "/admin/family" },
    { title: "Students", value: summary.students, href: "/admin/student" },
    { title: "Classes today", value: summary.classesToday, href: "/admin/schedule" },
    { title: "Active enrolments", value: summary.activeEnrolments, href: "/admin/enrolment" },
    { title: "Active class templates", value: summary.activeClassTemplates, href: "/admin/class" },
    { title: "Outstanding invoices", value: summary.outstandingInvoices, href: "/admin/billing" },
    { title: "SMS (last 7 days)", value: summary.smsLast7Days, href: smsHref },
    { title: "Emails (last 7 days)", value: summary.emailLast7Days, href: emailHref },
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">
            At-a-glance metrics and recent communications.
          </p>
        </div>

        {/* Clear filters */}
        <Link href={commsBase} className="text-sm text-primary hover:underline">
          View all communications
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} title={stat.title} value={stat.value} href={stat.href} />
        ))}
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
