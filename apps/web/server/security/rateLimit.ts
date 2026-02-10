import "server-only";

type RateLimitEntry = { count: number; resetAt: number };
type RateLimitStore = Map<string, RateLimitEntry>;

const store: RateLimitStore =
  (globalThis as typeof globalThis & { __securityRateLimit?: RateLimitStore }).__securityRateLimit ??
  new Map();

if (!(globalThis as typeof globalThis & { __securityRateLimit?: RateLimitStore }).__securityRateLimit) {
  (globalThis as typeof globalThis & { __securityRateLimit?: RateLimitStore }).__securityRateLimit = store;
}

export function checkRateLimit(key: string, config: { max: number; windowMs: number }) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || now > current.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs });
    return { ok: true } as const;
  }
  if (current.count >= config.max) {
    return { ok: false, retryAfterMs: current.resetAt - now } as const;
  }
  current.count += 1;
  store.set(key, current);
  return { ok: true } as const;
}
