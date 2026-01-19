"use client";

import { toast } from "sonner";
import { ZodError } from "zod";
import { parseCapacityError } from "@/lib/capacityError";

const DEFAULT_ERROR_TITLE = "Something went wrong";
const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

type ToastContent = {
  title: string;
  description?: string;
};

type MutationToastOptions<T> = {
  pending?: ToastContent;
  success: ToastContent | ((result: T) => ToastContent);
  error?:
    | { title?: string; description?: string }
    | ((message: string, error: unknown) => { title?: string; description?: string });
  onSuccess?: (result: T) => void;
  onError?: (message: string, error: unknown) => void;
  throwOnError?: boolean;
};

function extractMessage(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}

function getResultErrorMessage(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;

  if ("success" in result && (result as { success?: boolean }).success === false) {
    return extractMessage((result as { error?: unknown }).error) ?? DEFAULT_ERROR_MESSAGE;
  }

  if ("ok" in result && (result as { ok?: boolean }).ok === false) {
    return extractMessage((result as { error?: unknown }).error) ?? DEFAULT_ERROR_MESSAGE;
  }

  if ("error" in result) {
    const message = extractMessage((result as { error?: unknown }).error);
    if (message) return message;
  }

  return null;
}

function getFriendlyErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Please check the form for errors.";
  }

  const capacity = parseCapacityError(error);
  if (capacity) {
    return `Capacity exceeded for ${capacity.templateName}.`;
  }

  const extracted = extractMessage(error);
  if (extracted) return extracted;

  return DEFAULT_ERROR_MESSAGE;
}

function resolveToastContent<T>(content: ToastContent | ((result: T) => ToastContent), result: T) {
  return typeof content === "function" ? content(result) : content;
}

export async function runMutationWithToast<T>(
  action: () => Promise<T>,
  options: MutationToastOptions<T>
): Promise<T | null> {
  const pending = options.pending ?? { title: "Saving..." };
  const toastId = toast.loading(pending.title, pending.description ? { description: pending.description } : undefined);

  try {
    const result = await action();
    const resultError = getResultErrorMessage(result);
    if (resultError) {
      throw new Error(resultError);
    }

    const success = resolveToastContent(options.success, result);
    toast.success(success.title, {
      id: toastId,
      description: success.description,
    });
    options.onSuccess?.(result);
    return result;
  } catch (error) {
    const message = getFriendlyErrorMessage(error);
    const errorContent =
      typeof options.error === "function" ? options.error(message, error) : options.error ?? {};

    toast.error(errorContent.title ?? DEFAULT_ERROR_TITLE, {
      id: toastId,
      description: errorContent.description ?? message,
    });
    options.onError?.(message, error);
    if (options.throwOnError) {
      throw error;
    }
    return null;
  }
}
