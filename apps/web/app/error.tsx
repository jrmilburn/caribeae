"use client";

import * as React from "react";

import { BrandedError } from "@/components/errors/BrandedError";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return <BrandedError variant="error" error={error} reset={reset} />;
}
