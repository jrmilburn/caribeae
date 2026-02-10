import "server-only";

import { randomUUID } from "crypto";
import type { IdentifierType } from "@/lib/auth/identity";
import { getRedis } from "@/server/security/redis";

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

export async function createPendingAuth(data: Omit<PendingAuth, "createdAt">) {
  const token = randomUUID();
  const entry = { ...data, createdAt: Date.now() };

  const redis = getRedis();
  if (redis) {
    await redis.set(`pending-auth:${token}`, entry, { px: PENDING_AUTH_TTL_MS });
    return token;
  }

  pendingAuthStore.set(token, entry);
  return token;
}

export async function consumePendingAuth(token: string) {
  const redis = getRedis();
  if (redis) {
    const key = `pending-auth:${token}`;
    const entry = await redis.get<PendingAuth>(key);
    if (!entry) return null;
    await redis.del(key);
    if (isExpired(entry)) return null;
    return entry;
  }

  const entry = pendingAuthStore.get(token);
  if (!entry) return null;
  if (isExpired(entry)) {
    pendingAuthStore.delete(token);
    return null;
  }
  pendingAuthStore.delete(token);
  return entry;
}
