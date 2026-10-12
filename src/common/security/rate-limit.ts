import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Small in-memory fixed-window limiter (the API runs as a single process). Returns 429 with a
 * Retry-After header once `max` requests from one IP arrive inside `windowMs`.
 */
export function createRateLimiter(opts: { windowMs: number; max: number; message?: string }) {
  const buckets = new Map<string, Bucket>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
  }, opts.windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({
        statusCode: 429,
        message: opts.message ?? 'Too many requests. Please slow down and try again shortly.',
        error: 'Too Many Requests',
      });
      return;
    }
    next();
  };
}

/** Counts failed PIN attempts per client and locks that client out for a while after too many. */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; lockedUntil?: number }>();

  constructor(
    private readonly maxAttempts = 5,
    private readonly lockMs = 5 * 60 * 1000,
  ) {}

  /** Throws-free check: returns the seconds left on a lock, or 0. */
  lockedFor(key: string): number {
    const rec = this.failures.get(key);
    if (!rec?.lockedUntil) return 0;
    const left = rec.lockedUntil - Date.now();
    if (left <= 0) {
      this.failures.delete(key);
      return 0;
    }
    return Math.ceil(left / 1000);
  }

  fail(key: string) {
    const rec = this.failures.get(key) ?? { count: 0 };
    rec.count += 1;
    if (rec.count >= this.maxAttempts) rec.lockedUntil = Date.now() + this.lockMs;
    this.failures.set(key, rec);
    // Keep the map from growing without bound.
    if (this.failures.size > 5000) {
      const now = Date.now();
      for (const [k, v] of this.failures) if (v.lockedUntil && v.lockedUntil < now) this.failures.delete(k);
    }
  }

  succeed(key: string) {
    this.failures.delete(key);
  }
}
