import "server-only";

import { randomUUID } from "crypto";

import type { IdentifierType } from "@/lib/auth/identity";
import { getRedis } from "@/server/security/redis";

const PENDING_TEACHER_AUTH_TTL_MS = 15 * 60 * 1000;

type PendingTeacherAuth = {
  teacherId: string;
  identifier: string;
  type: IdentifierType;
  flow: "signIn" | "signUp";
  createdAt: number;
};

type PendingTeacherAuthStore = Map<string, PendingTeacherAuth>;

const pendingTeacherAuthStore: PendingTeacherAuthStore =
  (globalThis as typeof globalThis & { __pendingTeacherAuthStore?: PendingTeacherAuthStore })
    .__pendingTeacherAuthStore ?? new Map();

if (
  !(globalThis as typeof globalThis & { __pendingTeacherAuthStore?: PendingTeacherAuthStore })
    .__pendingTeacherAuthStore
) {
  (globalThis as typeof globalThis & { __pendingTeacherAuthStore?: PendingTeacherAuthStore })
    .__pendingTeacherAuthStore = pendingTeacherAuthStore;
}

function isExpired(entry: PendingTeacherAuth) {
  return Date.now() - entry.createdAt > PENDING_TEACHER_AUTH_TTL_MS;
}

export async function createPendingTeacherAuth(
  data: Omit<PendingTeacherAuth, "createdAt">
) {
  const token = randomUUID();
  const entry = { ...data, createdAt: Date.now() };

  const redis = getRedis();
  if (redis) {
    await redis.set(`pending-teacher-auth:${token}`, entry, {
      px: PENDING_TEACHER_AUTH_TTL_MS,
    });
    return token;
  }

  pendingTeacherAuthStore.set(token, entry);
  return token;
}

export async function consumePendingTeacherAuth(token: string) {
  const redis = getRedis();
  if (redis) {
    const key = `pending-teacher-auth:${token}`;
    const entry = await redis.get<PendingTeacherAuth>(key);
    if (!entry) return null;
    await redis.del(key);
    if (isExpired(entry)) return null;
    return entry;
  }

  const entry = pendingTeacherAuthStore.get(token);
  if (!entry) return null;
  if (isExpired(entry)) {
    pendingTeacherAuthStore.delete(token);
    return null;
  }

  pendingTeacherAuthStore.delete(token);
  return entry;
}
