// Counts failed credential checks per key in process memory. Boberit runs as a single container,
// so no shared store is needed; counters reset on restart.
export class FailureLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly capacity = 10_000,
  ) {}

  /** Seconds until the key may try again, or 0 when it is not blocked. */
  retryAfter(key: string, now = Date.now()): number {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) return 0;
    return entry.count >= this.maxFailures ? Math.ceil((entry.resetAt - now) / 1000) : 0;
  }

  fail(key: string, now = Date.now()): void {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt > now) {
      entry.count += 1;
      return;
    }
    if (this.entries.size >= this.capacity) this.prune(now);
    this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) if (entry.resetAt <= now) this.entries.delete(key);
    // Bound memory even when many keys are still active: drop the oldest insertions first.
    for (const key of this.entries.keys()) {
      if (this.entries.size < this.capacity) break;
      this.entries.delete(key);
    }
  }
}
