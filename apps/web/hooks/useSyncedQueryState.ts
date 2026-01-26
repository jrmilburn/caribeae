"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type SyncedQueryOptions<T> = {
  defaultValue: T;
  parse: (value: string | null) => T;
  serialize: (value: T) => string | null;
  history?: "replace" | "push";
};

export function useSyncedQueryState<T>(
  key: string,
  { defaultValue, parse, serialize, history = "replace" }: SyncedQueryOptions<T>
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = React.useState<T>(() => {
    const raw = searchParams.get(key);
    const parsed = parse(raw);
    return parsed ?? defaultValue;
  });

  React.useEffect(() => {
    const raw = searchParams.get(key);
    const parsed = parse(raw);
    setState((prev) => {
      const next = parsed ?? defaultValue;
      return Object.is(prev, next) ? prev : next;
    });
  }, [defaultValue, key, parse, searchParams]);

  const update = React.useCallback(
    (next: T) => {
      setState(next);
      const params = new URLSearchParams(searchParams.toString());
      const encoded = serialize(next);
      if (!encoded) {
        params.delete(key);
      } else {
        params.set(key, encoded);
      }
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (history === "push") {
        router.push(url);
      } else {
        router.replace(url);
      }
    },
    [history, key, pathname, router, searchParams, serialize]
  );

  return [state, update] as const;
}
