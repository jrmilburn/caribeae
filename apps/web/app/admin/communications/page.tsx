import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { CommunicationsTable } from "./CommunicationsTable";
import { listCommunications } from "@/server/communication/listCommunications";
import { MessageChannel, MessageDirection, MessageStatus } from "@prisma/client";

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

function buildHref(base: string, next: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
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
};

function FiltersRow({ current }: { current: CurrentFilters }) {
  const base = "/admin/communications";

  const chips: Array<{ label: string; next: Partial<CurrentFilters> }> = [
    { label: "All", next: { channel: null, status: null, direction: null, q: null, familyId: null } },
    { label: "SMS", next: { channel: MessageChannel.SMS } },
    { label: "Email", next: { channel: MessageChannel.EMAIL } },
    { label: "Delivered", next: { status: MessageStatus.DELIVERED } },
    { label: "Failed", next: { status: MessageStatus.FAILED } },
    { label: "Pending", next: { status: MessageStatus.PENDING } },
    { label: "Sent", next: { status: MessageStatus.SENT } },
    { label: "Outbound", next: { direction: MessageDirection.OUTBOUND } },
    { label: "Inbound", next: { direction: MessageDirection.INBOUND } },
  ];

  const isAllChip = (next: Partial<CurrentFilters>) =>
    next.channel === null &&
    next.status === null &&
    next.direction === null &&
    next.q === null &&
    next.familyId === null;

  const isActive = (next: Partial<CurrentFilters>) => {
    if (isAllChip(next)) {
      return !current.channel && !current.status && !current.direction && !current.q && !current.familyId;
    }

    const keys = Object.keys(next) as Array<keyof CurrentFilters>;
    for (const k of keys) {
      const v = next[k];
      if (v === undefined) continue;
      if (current[k] !== v) return false;
    }
    return true;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => {
        const merged: CurrentFilters = isAllChip(c.next)
          ? { channel: null, status: null, direction: null, q: null, familyId: null }
          : { ...current, ...c.next };

        const href = buildHref(base, {
          channel: merged.channel ?? null,
          status: merged.status ?? null,
          direction: merged.direction ?? null,
          q: merged.q ?? null,
          familyId: merged.familyId ?? null,
        });

        return (
          <Link key={c.label} href={href}>
            <Badge variant={isActive(c.next) ? "default" : "secondary"} className="cursor-pointer">
              {c.label}
            </Badge>
          </Link>
        );
      })}

      {current.channel || current.status || current.direction || current.q || current.familyId ? (
        <Link href={base} className="ml-2 text-xs text-muted-foreground hover:underline">
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

  const communications = await listCommunications({
    limit: 200,
    filters: {
      channel: channel ?? undefined,
      status: status ?? undefined,
      direction: direction ?? undefined,
      q: q ?? undefined,
      familyId: familyId ?? undefined,
    },
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-card px-4 py-3">
        <h1 className="text-base font-semibold">Communications</h1>
        <p className="text-xs text-muted-foreground">Recent emails and messages that have been sent.</p>

        <div className="mt-2">
          <FiltersRow current={{ channel, status, direction, q, familyId }} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <CommunicationsTable communications={communications} />
      </div>
    </div>
  );
}
