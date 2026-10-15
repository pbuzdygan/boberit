import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { daysUntil, localDate } from '../src/dates.ts';

// Node applies TZ changes at runtime, so each test pins the zone explicitly.
const originalZone = process.env.TZ;
afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});

test('localDate uses the local calendar date, not the UTC date', () => {
  process.env.TZ = 'Europe/Warsaw';
  assert.equal(localDate(new Date('2026-10-13T22:30:00Z')), '2026-10-14', '00:30 in Warsaw is already the next day');
  assert.equal(localDate(new Date('2026-10-14T21:59:00Z')), '2026-10-14', '23:59 in Warsaw is still the same day');
  process.env.TZ = 'UTC';
  assert.equal(localDate(new Date('2026-10-13T22:30:00Z')), '2026-10-13');
});

test('daysUntil counts calendar days regardless of the time of day', () => {
  process.env.TZ = 'Europe/Warsaw';
  for (const instant of ['2026-10-13T22:01:00Z', '2026-10-14T10:00:00Z', '2026-10-14T21:59:00Z']) {
    const now = new Date(instant);
    assert.equal(daysUntil('2026-10-14', now), 0, `today at ${instant}`);
    assert.equal(daysUntil('2026-10-15', now), 1, `tomorrow at ${instant}`);
    assert.equal(daysUntil('2026-10-30', now), 16, `in 16 days at ${instant}`);
    assert.equal(daysUntil('2026-10-13', now), -1, `yesterday at ${instant}`);
  }
});

test('daysUntil stays exact across daylight saving time changes', () => {
  process.env.TZ = 'Europe/Warsaw';
  // Clocks go back on 2026-10-25 (25-hour day) and forward on 2026-03-29 (23-hour day).
  assert.equal(daysUntil('2026-10-26', new Date('2026-10-24T22:30:00Z')), 1);
  assert.equal(daysUntil('2026-10-26', new Date('2026-10-23T22:30:00Z')), 2);
  assert.equal(daysUntil('2026-03-30', new Date('2026-03-28T23:30:00Z')), 1);
  assert.equal(daysUntil('2026-03-30', new Date('2026-03-27T23:30:00Z')), 2);
  assert.equal(daysUntil('2027-10-14', new Date('2026-10-14T10:00:00Z')), 365);
});
