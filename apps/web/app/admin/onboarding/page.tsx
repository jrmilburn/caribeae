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

function parseStatus(value: string | undefined) {
  if (value === "NEW" || value === "ACCEPTED" || value === "DECLINED") return value;
  return null;
}

export default async function OnboardingAdminPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const params = resolved ?? {};
  const { q, cursor, pageSize, cursorStack } = parsePaginationSearchParams(params);
  const status = parseStatus(first(params.status));

  const [requests, levels, enrolmentPlans] = await Promise.all([
    listOnboardingRequests({
      pageSize,
      cursor,
      filters: {
        q,
        status,
      },
    }),
    prisma.level.findMany({ orderBy: { levelOrder: "asc" }, select: { id: true, name: true } }),
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
      cursorStack={cursorStack}
      statusFilter={status}
      levels={levels}
      enrolmentPlans={enrolmentPlans}
    />
  );
}
