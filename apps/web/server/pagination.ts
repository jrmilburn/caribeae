export type SearchParamInput = Record<string, string | string[] | undefined>;

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

function first(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function parsePaginationSearchParams(searchParams: SearchParamInput) {
  const qRaw = first(searchParams.q);
  const cursorRaw = first(searchParams.cursor);
  const pageSizeRaw = Number(first(searchParams.pageSize));

  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw as (typeof PAGE_SIZE_OPTIONS)[number])
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;

  const cursor = cursorRaw?.trim() ? cursorRaw.trim() : null;
  const q = qRaw?.trim() ? qRaw.trim() : null;

  const cursorsRaw = searchParams.cursors;
  const cursors = Array.isArray(cursorsRaw)
    ? cursorsRaw
    : typeof cursorsRaw === "string"
      ? cursorsRaw.split(",")
      : [];

  const cursorStack = cursors.map((value) => value.trim()).filter(Boolean);

  return {
    q,
    cursor,
    pageSize,
    cursorStack,
  };
}
