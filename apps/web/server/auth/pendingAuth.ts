import "server-only";

import { randomUUID } from "crypto";
import type { IdentifierType } from "@/lib/auth/identity";

const PENDING_AUTH_TTL_MS = 15 * 60 * 1000;

type PendingAuth = {
  familyId: string;
  identifier: string;
  type: IdentifierType;
  flow: "signIn" | "signUp";
  createdAt: number;
};

type PendingAuthStore = Map<string, PendingAuth>;

const pendingAuthStore: PendingAuthStore =
  (globalThis as typeof globalThis & { __pendingAuthStore?: PendingAuthStore }).__pendingAuthStore ??
  new Map();

if (!(globalThis as typeof globalThis & { __pendingAuthStore?: PendingAuthStore }).__pendingAuthStore) {
  (globalThis as typeof globalThis & { __pendingAuthStore?: PendingAuthStore }).__pendingAuthStore =
    pendingAuthStore;
}

function isExpired(entry: PendingAuth) {
  return Date.now() - entry.createdAt > PENDING_AUTH_TTL_MS;
}

export function createPendingAuth(data: Omit<PendingAuth, "createdAt">) {
  const token = randomUUID();
  pendingAuthStore.set(token, { ...data, createdAt: Date.now() });
  return token;
}

export function consumePendingAuth(token: string) {
  const entry = pendingAuthStore.get(token);
  if (!entry) return null;
  if (isExpired(entry)) {
    pendingAuthStore.delete(token);
    return null;
  }
  pendingAuthStore.delete(token);
  return entry;
}
