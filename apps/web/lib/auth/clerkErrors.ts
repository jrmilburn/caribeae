import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export function parseClerkError(err: unknown): { message: string; codes?: string[] } {
  if (isClerkAPIResponseError(err)) {
    const codes = err.errors.map((entry) => entry.code).filter(Boolean);
    const message =
      err.errors
        .map((entry) => entry.longMessage ?? entry.message)
        .find((value): value is string => Boolean(value)) ??
      err.message ??
      DEFAULT_MESSAGE;

    return {
      message,
      codes: codes.length > 0 ? codes : undefined,
    };
  }

  if (err instanceof Error) {
    return { message: err.message || DEFAULT_MESSAGE };
  }

  if (typeof err === "string" && err.trim()) {
    return { message: err.trim() };
  }

  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return { message: err.message || DEFAULT_MESSAGE };
  }

  return { message: DEFAULT_MESSAGE };
}
