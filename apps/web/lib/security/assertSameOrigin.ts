import "server-only";

import { getAppBaseUrl } from "@/lib/stripe";

export class CsrfValidationError extends Error {
  constructor(message = "Invalid CSRF origin.") {
    super(message);
    this.name = "CsrfValidationError";
  }
}

function toOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Route handlers should only accept same-origin POSTs from the admin app.
export function assertSameOrigin(request: Request) {
  const expectedOrigin = new URL(getAppBaseUrl()).origin;
  const origin = toOrigin(request.headers.get("origin"));
  const referer = toOrigin(request.headers.get("referer"));

  if (origin && origin === expectedOrigin) {
    return;
  }

  if (!origin && referer && referer === expectedOrigin) {
    return;
  }

  throw new CsrfValidationError();
}
