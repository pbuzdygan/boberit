import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  attentionAssets,
  avatarInitials,
  filterCollection,
  remindersDueToday,
  upcomingReminders,
} from '../src/collections.ts';

const now = new Date(2026, 5, 1, 12);
const asset = (id, extra = {}) => ({ id, warranty: null, maintenancePlans: [], completeness: 'complete', ...extra });
const fixed = (expiresOn) => ({ kind: 'fixed', expiresOn });
const plan = (id, nextDueOn, extra = {}) => ({ id, status: 'active', nextDueOn, lastCompletedOn: null, ...extra });

test('reminders cover warranty ends and active plans due within 30 days, soonest first', () => {
  const assets = [
    asset('a', {
      warranty: fixed('2026-06-20'),
      maintenancePlans: [plan('p1', '2026-06-01'), plan('p2', '2026-08-01')],
    }),
    asset('b', {
      warranty: fixed('2026-05-25'),
      maintenancePlans: [plan('p3', '2026-06-05', { status: 'completed' })],
    }),
    asset('c', { warranty: { kind: 'lifetime', expiresOn: null } }),
  ];
  const reminders = upcomingReminders(assets, now);
  assert.deepEqual(
    reminders.map((entry) => [entry.kind, entry.id, entry.dueOn]),
    [
      ['warranty', 'warranty-b', '2026-05-25'],
      ['maintenance', 'p1', '2026-06-01'],
      ['warranty', 'warranty-a', '2026-06-20'],
    ],
  );
  assert.equal(reminders[1].plan.id, 'p1');
  assert.equal(reminders[1].asset.id, 'a');
});

test('a plan completed before is listed only once it is due', () => {
  const done = (nextDueOn) => plan('p', nextDueOn, { lastCompletedOn: '2026-03-01' });
  assert.equal(upcomingReminders([asset('a', { maintenancePlans: [done('2026-06-10')] })], now).length, 0);
  assert.equal(upcomingReminders([asset('a', { maintenancePlans: [done('2026-06-01')] })], now).length, 1);
  assert.equal(upcomingReminders([asset('a', { maintenancePlans: [done('2026-05-20')] })], now).length, 1);
});

test('reminders due today are picked by calendar day', () => {
  const reminders = upcomingReminders(
    [asset('a', { warranty: fixed('2026-06-01'), maintenancePlans: [plan('p', '2026-06-02')] })],
    now,
  );
  assert.deepEqual(
    remindersDueToday(reminders, new Date(2026, 5, 1, 23, 59)).map((entry) => entry.id),
    ['warranty-a'],
  );
});

test('attention lists at most two items with a warranty ending soon', () => {
  mock.timers.enable({ apis: ['Date'], now });
  try {
    const assets = [
      asset('a', { warranty: fixed('2026-06-10') }),
      asset('b', { warranty: fixed('2026-12-31') }),
      asset('c', { warranty: fixed('2026-06-15') }),
      asset('d', { warranty: fixed('2026-06-20') }),
    ];
    assert.deepEqual(
      attentionAssets(assets).map((entry) => entry.id),
      ['a', 'c'],
    );
  } finally {
    mock.timers.reset();
  }
});

test('collection filters select warranties and drafts', () => {
  const assets = [
    asset('known', { warranty: fixed('2027-01-01') }),
    asset('unknown', { warranty: { kind: 'unknown', expiresOn: null } }),
    asset('draft', { completeness: 'draft' }),
  ];
  const ids = (filter) => filterCollection(assets, filter).map((entry) => entry.id);
  assert.deepEqual(ids('all'), ['known', 'unknown', 'draft']);
  assert.deepEqual(ids('warranty'), ['known']);
  assert.deepEqual(ids('draft'), ['draft']);
});

test('avatar initials use up to two characters of the login', () => {
  assert.equal(avatarInitials('owner'), 'OW');
  assert.equal(avatarInitials('  żaneta '), 'ŻA');
  assert.equal(avatarInitials(''), 'U');
  assert.equal(avatarInitials(undefined), 'U');
});
