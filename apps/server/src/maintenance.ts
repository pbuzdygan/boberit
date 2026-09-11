import type { IntervalUnit } from '@boberit/shared';

export function nextDueDate(from: string, value: number, unit: IntervalUnit): string {
  const date = new Date(`${from}T12:00:00.000Z`);
  if (Number.isNaN(date.valueOf())) throw new Error('Nieprawidłowa data terminu.');

  if (unit === 'days') date.setUTCDate(date.getUTCDate() + value);
  if (unit === 'weeks') date.setUTCDate(date.getUTCDate() + value * 7);
  if (unit === 'months') date.setUTCMonth(date.getUTCMonth() + value);
  if (unit === 'years') date.setUTCFullYear(date.getUTCFullYear() + value);

  return date.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
