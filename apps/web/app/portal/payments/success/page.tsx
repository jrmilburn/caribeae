import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function firstString(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

export default async function PortalPaymentsSuccessAliasPage({ searchParams }: PageProps) {
  const sp = await Promise.resolve(searchParams ?? {});
  const query = new URLSearchParams();

  const sessionId = firstString(sp.session_id);
  if (sessionId) {
    query.set("session_id", sessionId);
  }

  const queryString = query.toString();
  redirect(queryString ? `/portal/billing/success?${queryString}` : "/portal/billing");
}
