import type { PurchaseValue } from './types';

export function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' }).format(
        new Date(`${value}T12:00:00`),
      )
    : '—';
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
