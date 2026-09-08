/**
 * Minimal fixed-window limiter, in memory.
 *
 * Enough to stop a single tab from hammering the upload route during
 * development. A multi-instance deployment needs a shared store (Upstash,
 * Redis, or Supabase) instead — see the README.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}
