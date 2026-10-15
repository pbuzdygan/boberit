import { localDate } from '@boberit/shared';
import type { PurchaseValue } from './types';

export function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' }).format(
        new Date(`${value}T12:00:00`),
      )
    : '—';
}

/**
 * Calendar date of a stored timestamp (ISO 8601 with zone) in the browser's time zone. Slicing the
 * ISO string would show the UTC date, which is the previous day shortly after local midnight.
 */
export function formatTimestampDate(value: string): string {
  return formatDate(localDate(new Date(value)));
}

/** Heading for a day in a chronological list: "Dzisiaj", "Wczoraj", or the date (year only when not this year). */
export function dayLabel(at: Date, now: Date = new Date()): string {
  const day = localDate(at);
  if (day === localDate(now)) return 'Dzisiaj';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day === localDate(yesterday)) return 'Wczoraj';
  const options: Intl.DateTimeFormatOptions =
    at.getFullYear() === now.getFullYear()
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat('pl-PL', options).format(at);
}

/** Groups items that are already sorted newest first under their day headings. */
export function groupByDay<T>(items: T[], timeOf: (item: T) => Date, now: Date = new Date()) {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(timeOf(item), now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export function addYearsToDate(value: string, years: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return [targetYear, String(month).padStart(2, '0'), String(Math.min(day, lastDay)).padStart(2, '0')].join('-');
}

export function localDateKey(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join(
    '-',
  );
}

export function formatStorage(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1_048_576) return (bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0) + ' KB';
  if (bytes < 1_073_741_824) return (bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0) + ' MB';
  return (bytes / 1_073_741_824).toFixed(1) + ' GB';
}
export function formatPurchaseValues(values: PurchaseValue[]): string {
  if (!values.length) return '0,00 zł';
  return values
    .map(({ currency, amountMinor }) => {
      try {
        return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(amountMinor / 100);
      } catch {
        return (amountMinor / 100).toFixed(2) + ' ' + currency;
      }
    })
    .join(' + ');
}
export function fileSize(bytes: number): string {
  return bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;
}
