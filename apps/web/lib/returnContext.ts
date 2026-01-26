import type { ReadonlyURLSearchParams } from "next/navigation";

const RETURN_PARAM = "returnTo";

export function buildReturnUrl(target: string, returnTo?: string | null): string {
  if (!returnTo) return target;
  const [path, query] = target.split("?");
  const params = new URLSearchParams(query ?? "");
  params.set(RETURN_PARAM, returnTo);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function parseReturnContext(
  searchParams: URLSearchParams | ReadonlyURLSearchParams | null
): string | null {
  if (!searchParams) return null;
  return searchParams.get(RETURN_PARAM);
}
