import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

// ── Upstash path (production) ────────────────────────────────────────────────
// When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, rate limits
// are enforced globally across every serverless instance via a shared Redis.
// Identical limit values share one Ratelimit instance (Upstash caches
// internally on the key, so we just keep one per unique limit+window).

type Key = string; // `${limit}:${windowMs}`
const limiterCache = new Map<Key, Ratelimit>();

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const key: Key = `${limit}:${windowMs}`;
  const existing = limiterCache.get(key);
  if (existing) return existing;
  const seconds = Math.max(1, Math.round(windowMs / 1000));
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${seconds} s`),
    prefix: 'riq-rl',
    analytics: false
  });
  limiterCache.set(key, limiter);
  return limiter;
}

// ── In-memory fallback (local dev / no Upstash creds) ────────────────────────
// Per-process, so in serverless production this only enforces limits per warm
// instance. Only used when Upstash env vars aren't configured.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function checkMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    maybeSweep(now);
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

let lastSweep = 0;
function maybeSweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Enforce a sliding-window rate limit on `key`. Returns whether the caller
 * should be allowed through. Uses Upstash Redis in production (shared across
 * every serverless instance) and an in-memory fallback in local dev.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const upstash = getUpstashLimiter(limit, windowMs);
  if (upstash) {
    try {
      const res = await upstash.limit(key);
      return {
        ok: res.success,
        remaining: Math.max(0, res.remaining),
        resetAt: res.reset
      };
    } catch (err) {
      // If Redis is momentarily unreachable, fall open rather than breaking
      // the request — the in-memory fallback still gives a crude ceiling.
      console.warn('[rate-limit] Upstash error, falling back to memory:', err);
    }
  }
  return checkMemory(key, limit, windowMs);
}
