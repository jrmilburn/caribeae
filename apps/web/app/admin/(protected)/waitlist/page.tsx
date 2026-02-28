import { requireAdmin } from "@/lib/requireAdmin";
import { parsePaginationSearchParams } from "@/server/pagination";
import getClassTemplates from "@/server/classTemplate/getClassTemplates";
import { listWaitlistRequests } from "@/server/waitlist/listWaitlistRequests";
import type { WaitlistRequestStatus } from "@prisma/client";
import WaitlistPageClient from "./WaitlistPageClient";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

const STATUS_VALUES: WaitlistRequestStatus[] = ["PENDING", "APPROVED", "DECLINED", "CANCELLED"];

export default async function WaitlistPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await Promise.resolve(searchParams ?? {});
  const { q, cursor, pageSize } = parsePaginationSearchParams(sp);
  const statusRaw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const normalized = statusRaw?.toUpperCase();
  const statusFilter: WaitlistRequestStatus | null =
    normalized === "ALL"
      ? null
      : STATUS_VALUES.includes(normalized as WaitlistRequestStatus)
        ? (normalized as WaitlistRequestStatus)
        : "PENDING";

  const [waitlist, templates] = await Promise.all([
    listWaitlistRequests({ status: statusFilter, q, cursor, pageSize }),
    getClassTemplates(),
  ]);

  return (
    <WaitlistPageClient
      requests={waitlist.items}
      totalCount={waitlist.totalCount}
      nextCursor={waitlist.nextCursor}
      pageSize={pageSize}
      statusFilter={statusFilter ?? "ALL"}
      templates={templates}
    />
  );
}
