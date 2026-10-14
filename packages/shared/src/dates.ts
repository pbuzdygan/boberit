// Date-only values (YYYY-MM-DD) are calendar dates, not instants. They are interpreted in
// the local time zone of the runtime: the browser's zone in the web app and the process
// zone (TZ, UTC by default in the container) on the server.

const dayMs = 86_400_000;

/** Calendar date of `at` in the local time zone; unlike toISOString(), never shifted to UTC. */
export function localDate(at: Date = new Date()): string {
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${at.getFullYear()}-${month}-${day}`;
}

/** Calendar days from the local date of `now` to `date` (negative when overdue). */
export function daysUntil(date: string, now: Date = new Date()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // Both values are local midnights; rounding absorbs 23- and 25-hour days around DST changes.
  return Math.round((new Date(`${date}T00:00:00`).valueOf() - start.valueOf()) / dayMs);
}
