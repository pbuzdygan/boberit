import assert from 'node:assert/strict';
import { test } from 'node:test';
import { batchOcrMessage, intervalLabel } from '../src/labels.ts';

const recurring = (intervalValue, intervalUnit) => ({ scheduleKind: 'recurring', intervalValue, intervalUnit });

test('single intervals use natural phrases', () => {
  assert.equal(intervalLabel(recurring(1, 'days')), 'Codziennie');
  assert.equal(intervalLabel(recurring(1, 'weeks')), 'Co tydzień');
  assert.equal(intervalLabel(recurring(1, 'months')), 'Co miesiąc');
  assert.equal(intervalLabel(recurring(1, 'years')), 'Co rok');
});

test('Polish plural forms follow the 2-4 rule, excluding 12-14', () => {
  const cases = [
    [2, 'years', 'Co 2 lata'],
    [4, 'months', 'Co 4 miesiące'],
    [3, 'weeks', 'Co 3 tygodnie'],
    [5, 'years', 'Co 5 lat'],
    [6, 'months', 'Co 6 miesięcy'],
    [11, 'weeks', 'Co 11 tygodni'],
    [12, 'months', 'Co 12 miesięcy'],
    [13, 'years', 'Co 13 lat'],
    [14, 'weeks', 'Co 14 tygodni'],
    [22, 'years', 'Co 22 lata'],
    [25, 'months', 'Co 25 miesięcy'],
    [104, 'weeks', 'Co 104 tygodnie'],
    [112, 'weeks', 'Co 112 tygodni'],
    [10, 'days', 'Co 10 dni'],
    [2, 'days', 'Co 2 dni'],
  ];
  for (const [value, unit, expected] of cases) assert.equal(intervalLabel(recurring(value, unit)), expected);
});

test('one-off and incomplete plans have neutral labels', () => {
  assert.equal(intervalLabel({ scheduleKind: 'one_off', intervalValue: null, intervalUnit: null }), 'Jednorazowo');
  assert.equal(intervalLabel(recurring(null, null)), 'Cyklicznie');
});

test('batch OCR messages report what is left', () => {
  assert.equal(batchOcrMessage({ processed: 0, remaining: 0 }), 'Nie ma dokumentów oczekujących na OCR.');
  assert.equal(batchOcrMessage({ processed: 3, remaining: 0 }), 'Rozpoznano tekst w 3 dokumentach.');
  assert.equal(
    batchOcrMessage({ processed: 25, remaining: 4 }),
    'Rozpoznano tekst w 25 dokumentach. Pozostało 4 — uruchom OCR zaległych dokumentów ponownie.',
  );
});
