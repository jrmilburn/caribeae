import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { CommunicationsTable } from "./CommunicationsTable";
import { listCommunications } from "@/server/communication/listCommunications";
import { getClassFilterOptions } from "@/server/communication/getClassFilterOptions";
import { ClassFilter } from "./ClassFilter";
import { MessageChannel, MessageDirection, MessageStatus } from "@prisma/client";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { parsePaginationSearchParams } from "@/server/pagination";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function first(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function asEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  if (!value) return null;
  return allowed.includes(value as T) ? (value as T) : null;
}

function buildHref(
  base: string,
  next: Record<string, string | string[] | null | undefined>,
  pageSize?: number
) {
  const sp = new URLSearchParams();
  if (pageSize) sp.set("pageSize", String(pageSize));
  for (const [k, v] of Object.entries(next)) {
    if (Array.isArray(v)) {
      for (const val of v) {
        if (val) sp.append(k, val);
      }
      continue;
    }
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

type CurrentFilters = {
  channel: MessageChannel | null;
  status: MessageStatus | null;
  direction: MessageDirection | null;
  q: string | null;
  familyId: string | null;
  classIds: string[];
};

function mergeFilters(current: CurrentFilters, next: Partial<CurrentFilters>): CurrentFilters {
  return {
    channel: next.channel !== undefined ? (next.channel as CurrentFilters["channel"]) : current.channel,
    status: next.status !== undefined ? (next.status as CurrentFilters["status"]) : current.status,
    direction: next.direction !== undefined ? (next.direction as CurrentFilters["direction"]) : current.direction,
    q: next.q !== undefined ? (next.q as CurrentFilters["q"]) : current.q,
    familyId: next.familyId !== undefined ? (next.familyId as CurrentFilters["familyId"]) : current.familyId,
    classIds: next.classIds !== undefined ? next.classIds : current.classIds,
  };
}

function filtersEqual(a: CurrentFilters, b: CurrentFilters) {
  return (
    a.channel === b.channel &&
    a.status === b.status &&
    a.direction === b.direction &&
    a.q === b.q &&
    a.familyId === b.familyId &&
    a.classIds.length === b.classIds.length &&
    a.classIds.every((id, idx) => id === b.classIds[idx])
  );
}

function FiltersRow({
  current,
  base,
  pageSize,
}: {
  current: CurrentFilters;
  base: string;
  pageSize: number;
}) {
  const chips: Array<{ label: string; next: Partial<CurrentFilters> }> = [
    {
      label: "All",
      next: { channel: null, status: null, direction: null, q: null, familyId: null, classIds: [] },
    },
    { label: "SMS", next: { channel: MessageChannel.SMS } },
    { label: "Email", next: { channel: MessageChannel.EMAIL } },
    { label: "Delivered", next: { status: MessageStatus.DELIVERED } },
    { label: "Failed", next: { status: MessageStatus.FAILED } },
    { label: "Pending", next: { status: MessageStatus.PENDING } },
    { label: "Sent", next: { status: MessageStatus.SENT } },
    { label: "Outbound", next: { direction: MessageDirection.OUTBOUND } },
    { label: "Inbound", next: { direction: MessageDirection.INBOUND } },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => {
        const merged = mergeFilters(current, c.next);
        const href = buildHref(
          base,
          {
            channel: merged.channel ?? null,
            status: merged.status ?? null,
            direction: merged.direction ?? null,
            q: merged.q ?? null,
            familyId: merged.familyId ?? null,
            classIds: merged.classIds,
          },
          pageSize
        );

        return (
          <Link key={c.label} href={href}>
            <Badge variant={filtersEqual(current, merged) ? "default" : "secondary"} className="cursor-pointer">
              {c.label}
            </Badge>
          </Link>
        );
      })}

      {current.channel || current.status || current.direction || current.q || current.familyId || current.classIds.length ? (
        <Link href={buildHref(base, {}, pageSize)} className="ml-2 text-xs text-muted-foreground hover:underline">
          Clear filters
        </Link>
      ) : null}
    </div>
  );
}

export default async function CommunicationsPage({ searchParams }: PageProps) {
  noStore(); // ensures querystring changes always refetch on the server

  const sp = await Promise.resolve(searchParams ?? {});

  const channel = asEnum(first(sp.channel), ["SMS", "EMAIL"] as const) as MessageChannel | null;
  const status = asEnum(first(sp.status), ["PENDING", "SENT", "DELIVERED", "FAILED"] as const) as MessageStatus | null;
  const direction = asEnum(first(sp.direction), ["OUTBOUND", "INBOUND"] as const) as MessageDirection | null;

  const qRaw = first(sp.q);
  const familyIdRaw = first(sp.familyId);

  const q = qRaw?.trim() ? qRaw.trim() : null;
  const familyId = familyIdRaw?.trim() ? familyIdRaw.trim() : null;

  const classIdsRaw = sp.classIds;
  const classIds = Array.isArray(classIdsRaw)
    ? classIdsRaw.flatMap((id) => id.split(","))
    : typeof classIdsRaw === "string"
      ? classIdsRaw.split(",")
      : [];
  const normalizedClassIds = Array.from(new Set(classIds.map((id) => id.trim()).filter(Boolean)));

  const base = "/admin/communications";
  const { pageSize, cursor } = parsePaginationSearchParams(sp);

  const [communications, classOptions] = await Promise.all([
    listCommunications({
      pageSize,
      cursor,
      filters: {
        channel: channel ?? undefined,
        status: status ?? undefined,
        direction: direction ?? undefined,
        q: q ?? undefined,
        familyId: familyId ?? undefined,
        classIds: normalizedClassIds,
      },
    }),
    getClassFilterOptions(),
  ]);

  const currentFilters: CurrentFilters = {
    channel,
    status,
    direction,
    q,
    familyId,
    classIds: normalizedClassIds,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-card px-4 py-3">
        <h1 className="text-base font-semibold">Communications</h1>
        <p className="text-xs text-muted-foreground">Recent emails and messages that have been sent.</p>

        <div className="mt-2 flex flex-col gap-3">
          <FiltersRow current={currentFilters} base={base} pageSize={pageSize} />
          <ClassFilter options={classOptions} selectedIds={normalizedClassIds} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <CommunicationsTable communications={communications.items} />
      </div>

      <AdminPagination
        totalCount={communications.totalCount}
        pageSize={pageSize}
        currentCount={communications.items.length}
        nextCursor={communications.nextCursor}
      />
    </div>
  );
}
