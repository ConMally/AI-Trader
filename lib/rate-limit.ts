// Simple in-memory, fixed-window rate limiter keyed by caller-supplied
// string (typically `${userId}:${routeName}`). Adapted from the sibling
// Workout App's lib/rate-limit.ts — same shape, generalized to take a
// window/limit per call so different routes can have different budgets
// (order placement stricter than read-only GETs).
//
// NOTE: This is per-server-process. It resets on restart/redeploy and does
// not coordinate across multiple instances (e.g. serverless functions on
// Vercel can each have their own memory, so a determined client could get
// more requests than the limit by hitting different instances). For real
// production traffic, replace this with a shared store like Upstash Redis
// or Vercel KV. Reasonable, dependency-free starting point for Phase 1.

interface Bucket {
  count: number;
  windowStart: number;
}

// Rate limiting only gets in the way of local development/testing; disabled
// there the same way the reference project does it.
const RATE_LIMITING_ENABLED = process.env.NODE_ENV !== "development";

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  if (!RATE_LIMITING_ENABLED) {
    return { allowed: true };
  }

  const { windowMs, maxRequests } = options;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= maxRequests) {
    const retryAfterSeconds = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true };
}

// Named presets so route handlers don't each hand-pick numbers — order
// placement gets a much tighter budget than read-only GETs.
export const RATE_LIMITS = {
  read: { windowMs: 60_000, maxRequests: 60 },
  orderConfirm: { windowMs: 60_000, maxRequests: 10 },
  orderExecute: { windowMs: 60_000, maxRequests: 10 },
} as const satisfies Record<string, RateLimitOptions>;

// Periodic cleanup so the map doesn't grow forever on a long-running server.
const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      // A generous, single fixed window is enough for cleanup purposes —
      // this only prevents unbounded memory growth, not enforcement.
      if (now - bucket.windowStart > 60 * 60_000) {
        buckets.delete(key);
      }
    }
  },
  10 * 60_000
);
cleanupInterval.unref?.();
