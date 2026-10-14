import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  detailsFormFrom,
  detailsInput,
  isDetailsDirty,
  isWarrantyDirty,
  newPlanInput,
  parsePriceMinor,
  parseQuantity,
  parseTags,
  warrantyAfterKindChange,
  warrantyAfterPurchaseDate,
  warrantyFormFrom,
} from '../src/assetForm.ts';

const stored = {
  id: 'a1',
  name: 'Ekspres',
  manufacturer: 'Sage',
  modelNumber: null,
  serialNumber: null,
  purchaseDate: '2025-03-10',
  quantity: 1,
  priceMinor: 129900,
  externalUrl: null,
  tags: ['Kuchnia', 'AGD'],
  notes: null,
  categoryId: null,
  locationId: 'loc-1',
  itemStatus: 'in_use',
  warranty: { kind: 'fixed', scope: 'Producent', expiresOn: '2027-03-10' },
};
const warranty = (extra) => ({ kind: 'unknown', scope: '', expiresOn: '', dateIsAutomatic: false, ...extra });

test('a form built from the stored item is not dirty', () => {
  const form = detailsFormFrom(stored);
  assert.equal(form.price, '1299.00');
  assert.equal(form.tags, 'Kuchnia, AGD');
  assert.equal(isDetailsDirty(form, stored), false);
  assert.equal(isWarrantyDirty(warrantyFormFrom(stored), stored), false);
});

test('whitespace-only edits do not count as changes, real edits do', () => {
  const form = detailsFormFrom(stored);
  assert.equal(isDetailsDirty({ ...form, name: ' Ekspres ', tags: 'Kuchnia ,AGD' }, stored), false);
  assert.equal(isDetailsDirty({ ...form, price: '1299,00' }, stored), false);
  assert.equal(isDetailsDirty({ ...form, quantity: '0' }, stored), false);
  assert.equal(isDetailsDirty({ ...form, name: 'Ekspres 2' }, stored), true);
  assert.equal(isDetailsDirty({ ...form, tags: 'AGD, Kuchnia' }, stored), true);
  assert.equal(isDetailsDirty({ ...form, locationId: '' }, stored), true);
});

test('an end date only matters for a fixed warranty', () => {
  const lifetime = { ...stored, warranty: { kind: 'lifetime', scope: null, expiresOn: null } };
  assert.equal(isWarrantyDirty(warranty({ kind: 'lifetime', expiresOn: '2030-01-01' }), lifetime), false);
  assert.equal(isWarrantyDirty({ ...warrantyFormFrom(stored), expiresOn: '2028-01-01' }, stored), true);
});

test('parsing accepts a decimal comma and falls back to sensible values', () => {
  assert.equal(parsePriceMinor(''), null);
  assert.equal(parsePriceMinor('12,5'), 1250);
  assert.equal(parsePriceMinor('0.1'), 10);
  assert.equal(parseQuantity('abc'), 1);
  assert.equal(parseQuantity('-3'), 1);
  assert.equal(parseQuantity('4'), 4);
  assert.deepEqual(parseTags(' a, ,b ,'), ['a', 'b']);
});

test('the save payload maps empty choices to null', () => {
  const input = detailsInput({ ...detailsFormFrom(stored), categoryId: '', locationId: '', price: '' });
  assert.equal(input.modelNumber, '');
  assert.equal(input.categoryId, null);
  assert.equal(input.locationId, null);
  assert.equal(input.priceMinor, null);
  assert.deepEqual(input.tags, ['Kuchnia', 'AGD']);
});

test('a purchase date proposes a two-year warranty and clearing it withdraws the proposal', () => {
  const proposed = warrantyAfterPurchaseDate(warranty(), '2026-01-15');
  assert.deepEqual(proposed, warranty({ kind: 'fixed', expiresOn: '2028-01-15', dateIsAutomatic: true }));
  assert.deepEqual(warrantyAfterPurchaseDate(proposed, '2026-02-01').expiresOn, '2028-02-01');
  assert.deepEqual(warrantyAfterPurchaseDate(proposed, ''), warranty());
});

test('a manual or non-fixed warranty is kept when the purchase date changes', () => {
  const manual = warranty({ kind: 'fixed', expiresOn: '2029-05-05' });
  assert.equal(warrantyAfterPurchaseDate(manual, '2026-01-15'), manual);
  assert.equal(warrantyAfterPurchaseDate(manual, ''), manual);
  const lifetime = warranty({ kind: 'lifetime' });
  assert.equal(warrantyAfterPurchaseDate(lifetime, '2026-01-15'), lifetime);
});

test('switching the warranty kind fills a missing end date from the purchase date', () => {
  assert.deepEqual(
    warrantyAfterKindChange(warranty(), 'fixed', '2026-01-15'),
    warranty({ kind: 'fixed', expiresOn: '2028-01-15', dateIsAutomatic: true }),
  );
  assert.deepEqual(warrantyAfterKindChange(warranty(), 'fixed', ''), warranty({ kind: 'fixed' }));
  const automatic = warranty({ kind: 'fixed', expiresOn: '2028-01-15', dateIsAutomatic: true });
  assert.deepEqual(warrantyAfterKindChange(automatic, 'lifetime', '2026-01-15'), {
    ...automatic,
    kind: 'lifetime',
    dateIsAutomatic: false,
  });
  const manual = warranty({ kind: 'lifetime', expiresOn: '2029-05-05' });
  assert.deepEqual(warrantyAfterKindChange(manual, 'fixed', '2026-01-15'), { ...manual, kind: 'fixed' });
});

test('a one-off plan has no interval; a recurring one has at least 1', () => {
  const base = { title: 'Filtr', interval: '0', unit: 'months', dueOn: '2026-07-01', notes: '' };
  assert.deepEqual(newPlanInput({ ...base, kind: 'recurring' }), {
    title: 'Filtr',
    scheduleKind: 'recurring',
    intervalValue: 1,
    intervalUnit: 'months',
    nextDueOn: '2026-07-01',
    notes: null,
  });
  const oneOff = newPlanInput({ ...base, kind: 'one_off', notes: 'HEPA' });
  assert.equal(oneOff.intervalValue, null);
  assert.equal(oneOff.intervalUnit, null);
  assert.equal(oneOff.notes, 'HEPA');
});
