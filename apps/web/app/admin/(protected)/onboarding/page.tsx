import { parsePaginationSearchParams } from "@/server/pagination";
import { listOnboardingRequests } from "@/server/onboarding/listOnboardingRequests";
import { prisma } from "@/lib/prisma";
import { OnboardingReviewClient } from "./OnboardingReviewClient";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function first(value: string | string[] | undefined) {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function parseView(value: string | undefined) {
  if (value === "reviewed") return "reviewed" as const;
  return "pending" as const;
}

function parseReviewedStatus(value: string | undefined) {
  if (value === "ACCEPTED" || value === "DECLINED") return value;
  return null;
}

export default async function OnboardingAdminPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const params = resolved ?? {};
  const { q, cursor, pageSize } = parsePaginationSearchParams(params);
  const view = parseView(first(params.view));
  const reviewedStatus = view === "reviewed" ? parseReviewedStatus(first(params.status)) : null;
  const statuses =
    view === "reviewed"
      ? reviewedStatus
        ? [reviewedStatus]
        : (["ACCEPTED", "DECLINED"] as const)
      : (["NEW"] as const);

  const [requests, levels, enrolmentPlans] = await Promise.all([
    listOnboardingRequests({
      pageSize,
      cursor,
      filters: {
        q,
        statuses: [...statuses],
      },
    }),
    prisma.level.findMany({ orderBy: { levelOrder: "asc" } }),
    prisma.enrolmentPlan.findMany({
      orderBy: { name: "asc" },
      include: { level: true },
    }),
  ]);

  return (
    <OnboardingReviewClient
      requests={requests.items}
      totalCount={requests.totalCount}
      nextCursor={requests.nextCursor}
      pageSize={pageSize}
      view={view}
      reviewedStatusFilter={reviewedStatus}
      pendingCount={requests.tabCounts.pending}
      reviewedCount={requests.tabCounts.reviewed}
      levels={levels}
      enrolmentPlans={enrolmentPlans}
    />
  );
}
