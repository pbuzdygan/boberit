import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  date,
  integer,
  isCalendarDate,
  number,
  oneOf,
  required,
  requiredText,
  shape,
  text,
  textList,
} from '../src/validate.ts';

const rejects = (rule, value, message) => assert.throws(() => rule(value), message ? { message } : { status: 400 });

test('text checks type and length; null means empty', () => {
  const name = text('Nazwa', 5);
  assert.equal(name(undefined), undefined);
  assert.equal(name(null), '');
  assert.equal(name(' ab '), ' ab ');
  rejects(name, 5, 'Nieprawidłowa wartość pola „Nazwa”.');
  rejects(name, '123456', 'Pole „Nazwa” może mieć najwyżej 5 znaków.');
  rejects(requiredText('Nazwa', 5), undefined, 'Pole „Nazwa” jest wymagane.');
  assert.equal(requiredText('Nazwa', 5)(''), '');
});

test('dates must exist in the calendar', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2025-02-29'), false);
  assert.equal(isCalendarDate('2025-13-01'), false);
  assert.equal(isCalendarDate('15.01.2025'), false);
  const due = date('Termin');
  assert.equal(due(''), '');
  assert.equal(due(null), '');
  assert.equal(due('2026-01-15'), '2026-01-15');
  rejects(due, '2026-1-15');
  rejects(due, 20260115);
});

test('numbers and enumerations', () => {
  const interval = integer('Co ile', 1, 1000);
  assert.equal(interval(null), null);
  assert.equal(interval(3), 3);
  rejects(interval, 0);
  rejects(interval, 2.5);
  rejects(interval, '3');
  const quantity = number('Ilość', 0, 10);
  assert.equal(quantity(2.5), 2.5);
  rejects(quantity, Infinity);
  rejects(quantity, '2');
  const unit = oneOf('Jednostka', ['days', 'weeks'], true);
  assert.equal(unit(''), undefined);
  assert.equal(unit(null), undefined);
  assert.equal(unit('days'), 'days');
  rejects(unit, 'hours');
  rejects(required('Jednostka', oneOf('Jednostka', ['days'])), undefined, 'Pole „Jednostka” jest wymagane.');
});

test('lists check every entry', () => {
  const tags = textList('Tagi', 2, 3);
  assert.deepEqual(tags(['a', 'bcd']), ['a', 'bcd']);
  rejects(tags, 'a');
  rejects(tags, ['a', 'b', 'c']);
  rejects(tags, ['abcd']);
  rejects(tags, [1]);
});

test('shape accepts plain objects, drops unknown fields, and keeps absent fields absent', () => {
  const input = shape({ name: requiredText('Nazwa', 10), notes: text('Notatki', 10) });
  assert.deepEqual(input({ name: 'A', extra: true }), { name: 'A' });
  assert.deepEqual(input({ name: 'A', notes: null }), { name: 'A', notes: '' });
  for (const value of [null, [], 'text', 5]) rejects(input, value, 'Nieprawidłowe dane żądania.');
});
