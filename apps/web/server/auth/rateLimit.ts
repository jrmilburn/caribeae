import "server-only";

import { getRedis } from "@/server/security/redis";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

type RateLimitEntry = { count: number; resetAt: number };

type RateLimitStore = Map<string, RateLimitEntry>;

const rateLimitStore: RateLimitStore =
  (globalThis as typeof globalThis & { __authRateLimit?: RateLimitStore }).__authRateLimit ??
  new Map();

if (!(globalThis as typeof globalThis & { __authRateLimit?: RateLimitStore }).__authRateLimit) {
  (globalThis as typeof globalThis & { __authRateLimit?: RateLimitStore }).__authRateLimit =
    rateLimitStore;
}

export async function checkRateLimit(key: string) {
  const redis = getRedis();
  if (redis) {
    const redisKey = `auth:rate:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, RATE_LIMIT_WINDOW_MS);
    }
    if (count > RATE_LIMIT_MAX) {
      const ttl = await redis.pttl(redisKey);
      return { ok: false, retryAfterMs: ttl > 0 ? ttl : RATE_LIMIT_WINDOW_MS } as const;
    }
    return { ok: true } as const;
  }

  const now = Date.now();
  const current = rateLimitStore.get(key);
  if (!current || now > current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true } as const;
  }
  if (current.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterMs: current.resetAt - now } as const;
  }
  current.count += 1;
  rateLimitStore.set(key, current);
  return { ok: true } as const;
}
