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

export default async function LegacyAdminPaymentsPage({ searchParams }: PageProps) {
  const sp = await Promise.resolve(searchParams ?? {});

  const query = new URLSearchParams();
  const refresh = firstString(sp.refresh);
  const returned = firstString(sp.return);

  if (refresh === "1") {
    query.set("stripe", "refresh");
  }

  if (returned === "1") {
    query.set("stripe", "return");
  }

  const queryString = query.toString();
  redirect(queryString ? `/admin/settings/payments?${queryString}` : "/admin/settings/payments");
}
