import { PublicError } from './http.js';

/**
 * Runs one job at a time, taking jobs from the waiting keys in turn (round robin), so one
 * household's many jobs cannot delay another household's job by more than one job per turn.
 */
export class FairQueue {
  private readonly waiting = new Map<string, (() => Promise<void>)[]>();
  private running = false;

  constructor(private readonly maxWaitingPerKey: number) {}

  /** Jobs of `key` that are queued or running. */
  pending(key: string): number {
    return this.waiting.get(key)?.length ?? 0;
  }

  /** Throws a 429 public error when `key` already has the maximum number of jobs waiting. */
  assertCapacity(key: string): void {
    if (this.pending(key) >= this.maxWaitingPerKey)
      throw new PublicError('Zbyt wiele plików czeka na OCR. Spróbuj ponownie za chwilę.', 429, 'TOO_MANY_JOBS');
  }

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    this.assertCapacity(key);
    return new Promise<T>((resolve, reject) => {
      const job = () => work().then(resolve, reject);
      const jobs = this.waiting.get(key);
      if (jobs) jobs.push(job);
      else this.waiting.set(key, [job]);
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // The key at the front runs one job and then moves to the back (Map keeps insertion order),
      // so a key that arrives while a job runs is served right after it.
      while (this.waiting.size) {
        const [key, jobs] = this.waiting.entries().next().value!;
        await jobs[0]!();
        jobs.shift();
        this.waiting.delete(key);
        if (jobs.length) this.waiting.set(key, jobs);
      }
    } finally {
      this.running = false;
    }
  }
}
