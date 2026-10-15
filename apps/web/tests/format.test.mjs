import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { addYearsToDate, fileSize, formatPurchaseValues, formatStorage, formatTimestampDate } from '../src/format.ts';
import { eventLabel, warrantyLabel, warrantySummary } from '../src/labels.ts';

test('adding years keeps the day or clamps it to the end of the month', () => {
  assert.equal(addYearsToDate('2024-05-10', 2), '2026-05-10');
  assert.equal(addYearsToDate('2024-02-29', 1), '2025-02-28');
  assert.equal(addYearsToDate('2024-02-29', 4), '2028-02-29');
  assert.equal(addYearsToDate('10.05.2024', 1), '');
});

test('timestamps show the local calendar date, not the UTC date', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Warsaw';
  try {
    // 23:30 UTC on 14 October is 01:30 on 15 October in Warsaw (CEST).
    assert.equal(formatTimestampDate('2026-10-14T23:30:00.000Z'), formatTimestampDate('2026-10-15T10:00:00.000Z'));
    assert.match(formatTimestampDate('2026-10-14T23:30:00.000Z'), /^15 paź 2026$/u);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('storage and file sizes use readable units', () => {
  assert.equal(formatStorage(512), '512 B');
  assert.equal(formatStorage(2048), '2.0 KB');
  assert.equal(formatStorage(20_480), '20 KB');
  assert.equal(formatStorage(5 * 1_048_576), '5.0 MB');
  assert.equal(formatStorage(2 * 1_073_741_824), '2.0 GB');
  assert.equal(fileSize(10), '1 KB');
  assert.equal(fileSize(3 * 1_048_576), '3.0 MB');
});

test('purchase values are formatted per currency with a safe fallback', () => {
  assert.equal(formatPurchaseValues([]), '0,00 zł');
  assert.match(formatPurchaseValues([{ currency: 'PLN', amountMinor: 1234 }]), /^12,34\s*zł$/u);
  assert.match(
    formatPurchaseValues([
      { currency: 'PLN', amountMinor: 100 },
      { currency: 'EUR', amountMinor: 250 },
    ]),
    / \+ /,
  );
  assert.equal(formatPurchaseValues([{ currency: 'INVALID', amountMinor: 100 }]), '1.00 INVALID');
});

test('warranty labels follow the remaining time', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 5, 1, 12) });
  try {
    const asset = (warranty) => ({ warranty });
    assert.deepEqual(warrantyLabel(asset(null)), { text: 'Brak danych', state: 'quiet' });
    assert.deepEqual(warrantyLabel(asset({ kind: 'lifetime', expiresOn: null })), {
      text: 'Dożywotnia',
      state: 'good',
    });
    assert.deepEqual(warrantyLabel(asset({ kind: 'fixed', expiresOn: '2026-05-31' })), {
      text: 'Po gwarancji',
      state: 'quiet',
    });
    assert.deepEqual(warrantyLabel(asset({ kind: 'fixed', expiresOn: '2026-06-11' })), {
      text: '10 dni',
      state: 'warning',
    });
    assert.equal(warrantyLabel(asset({ kind: 'fixed', expiresOn: '2027-06-11' })).state, 'good');
  } finally {
    mock.timers.reset();
  }
});

test('the warranty summary states the end date', () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 5, 1, 12) });
  try {
    const asset = (warranty) => ({ warranty });
    assert.equal(warrantySummary(asset(null)), 'Brak danych o gwarancji');
    assert.equal(warrantySummary(asset({ kind: 'fixed', expiresOn: null })), 'Brak danych o gwarancji');
    assert.equal(warrantySummary(asset({ kind: 'lifetime', expiresOn: null })), 'Gwarancja dożywotnia');
    assert.match(warrantySummary(asset({ kind: 'fixed', expiresOn: '2026-05-31' })), /^Wygasła 31 maj 2026$/u);
    assert.match(warrantySummary(asset({ kind: 'fixed', expiresOn: '2026-06-01' })), /^Wygasa dzisiaj · 1 cze 2026$/u);
    assert.match(warrantySummary(asset({ kind: 'fixed', expiresOn: '2026-06-02' })), /^Wygasa za 1 dzień · /u);
    assert.match(warrantySummary(asset({ kind: 'fixed', expiresOn: '2026-06-11' })), /^Wygasa za 10 dni · /u);
    assert.match(warrantySummary(asset({ kind: 'fixed', expiresOn: '2027-06-11' })), /^Ważna do 11 cze 2027$/u);
  } finally {
    mock.timers.reset();
  }
});

test('unknown webhook events fall back to their identifier', () => {
  assert.equal(eventLabel('asset.created'), 'Utworzono przedmiot');
  assert.equal(eventLabel('custom.event'), 'custom.event');
});
