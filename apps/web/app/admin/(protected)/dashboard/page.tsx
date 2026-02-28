import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSummary } from "@/server/dashboard/getDashboardSummary";
import { listCommunications } from "@/server/communication/listCommunications";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  LayoutGrid,
  Mail,
  MessageSquare,
  type LucideIcon,
  UserRound,
  Users,
} from "lucide-react";

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
  icon: Icon,
}: {
  title: string;
  value: number;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-lg border bg-card px-4 pb-12 pt-5 shadow-sm outline-none transition hover:-translate-y-[1px] hover:bg-muted/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-6 sm:pt-6"
    >
      <div>
        <div className="absolute rounded-md bg-primary/10 p-3 text-primary">
          <Icon aria-hidden="true" className="size-6" />
        </div>
        <p className="ml-16 truncate text-sm font-medium text-muted-foreground">{title}</p>
      </div>

      <div className="ml-16 flex items-baseline pb-6 sm:pb-7">
        <p className="text-2xl font-semibold tracking-tight">{value.toLocaleString()}</p>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t bg-muted/30 px-4 py-4 sm:px-6">
        <div className="text-sm">
          <span className="inline-flex items-center gap-1 font-medium text-primary transition group-hover:gap-1.5">
            View details
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="sr-only"> for {title}</span>
        </div>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const [summary, recentCommunications] = await Promise.all([
    getDashboardSummary(),
    listCommunications({ pageSize: 5 }),
  ]);

  const commsBase = "/admin/communications";
  const smsHref = buildHref(commsBase, { channel: "SMS" });
  const emailHref = buildHref(commsBase, { channel: "EMAIL" });

  const stats = [
    { title: "Families", value: summary.families, href: "/admin/family", icon: Users },
    { title: "Students", value: summary.students, href: "/admin/student", icon: UserRound },
    { title: "Classes today", value: summary.classesToday, href: "/admin/schedule", icon: CalendarDays },
    { title: "Active enrolments", value: summary.activeEnrolments, href: "/admin/enrolment", icon: ClipboardCheck },
    { title: "Active class templates", value: summary.activeClassTemplates, href: "/admin/class", icon: LayoutGrid },
    { title: "Overdue enrolments", value: summary.overdueEnrolments, href: "/admin/billing", icon: AlertTriangle },
    { title: "SMS (last 7 days)", value: summary.smsLast7Days, href: smsHref, icon: MessageSquare },
    { title: "Emails (last 7 days)", value: summary.emailLast7Days, href: emailHref, icon: Mail },
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
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            href={stat.href}
            icon={stat.icon}
          />
        ))}
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Recent communications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentCommunications.items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No communications yet.</div>
          ) : (
            <div className="space-y-3">
              {recentCommunications.items.map((comm) => (
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
