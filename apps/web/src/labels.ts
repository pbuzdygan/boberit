import {
  daysUntil,
  type AssetFileKind,
  type AssetSummary,
  type ItemStatus,
  type MaintenancePlan,
} from '@boberit/shared';
import type { IconName } from './components/Icon';
import type { OcrStatus } from './types';

export function intervalLabel(plan: MaintenancePlan): string {
  if (plan.scheduleKind === 'one_off') return 'Jednorazowo';
  if (!plan.intervalUnit || !plan.intervalValue) return 'Cyklicznie';
  if (plan.intervalValue === 1)
    return { days: 'Codziennie', weeks: 'Co tydzień', months: 'Co miesiąc', years: 'Co rok' }[plan.intervalUnit];
  // Polish plural: 2-4 (except 12-14) take the "few" form, everything else the "many" form.
  const forms: Record<NonNullable<MaintenancePlan['intervalUnit']>, [string, string]> = {
    days: ['dni', 'dni'],
    weeks: ['tygodnie', 'tygodni'],
    months: ['miesiące', 'miesięcy'],
    years: ['lata', 'lat'],
  };
  const value = plan.intervalValue;
  const few = value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14);
  return `Co ${value} ${forms[plan.intervalUnit][few ? 0 : 1]}`;
}

export function warrantyLabel(asset: AssetSummary): { text: string; state: 'good' | 'warning' | 'quiet' } {
  const warranty = asset.warranty;
  if (!warranty || warranty.kind === 'unknown') return { text: 'Brak danych', state: 'quiet' };
  if (warranty.kind === 'lifetime') return { text: 'Dożywotnia', state: 'good' };
  if (!warranty.expiresOn) return { text: 'Brak danych', state: 'quiet' };
  const days = daysUntil(warranty.expiresOn);
  if (days < 0) return { text: 'Po gwarancji', state: 'quiet' };
  if (days <= 30) return { text: `${days} dni`, state: 'warning' };
  return {
    text: `Do ${new Intl.DateTimeFormat('pl-PL', { year: 'numeric', month: 'short' }).format(new Date(`${warranty.expiresOn}T12:00:00`))}`,
    state: 'good',
  };
}

export const itemStatusMeta: Record<ItemStatus, { label: string; className: string }> = {
  available: { label: 'Dostępny', className: 'available' },
  reserved: { label: 'Zarezerwowany', className: 'reserved' },
  in_use: { label: 'W użyciu', className: 'in-use' },
  in_repair: { label: 'W naprawie', className: 'in-repair' },
  retired: { label: 'Wycofany', className: 'retired' },
};
export const fileKindLabels: Record<AssetFileKind, string> = {
  receipt: 'Paragon',
  manual: 'Instrukcja',
  photo: 'Zdjęcie',
  other: 'Inne',
};

export const unsavedAssetMessage = 'Masz niezapisane zmiany w tym przedmiocie. Opuścić widok i je odrzucić?';
export const unsavedDocumentMessage = 'Masz niezapisane zmiany w tym dokumencie. Opuścić widok i je odrzucić?';

const webhookEventLabels: Record<string, string> = {
  'asset.created': 'Utworzono przedmiot',
  'asset.deleted': 'Usunięto przedmiot',
  'document.created': 'Utworzono dokument',
  'document.deleted': 'Usunięto dokument',
  'maintenance.created': 'Dodano konserwację',
  'maintenance.completed': 'Wykonano konserwację',
  'backup.exported': 'Pobrano backup',
  'backup.restored': 'Przywrócono backup',
};

export function eventLabel(value: string): string {
  return webhookEventLabels[value] ?? value;
}

export function ocrStatusMeta(status: OcrStatus): { label: string; icon: IconName } {
  const statuses: Record<OcrStatus, { label: string; icon: IconName }> = {
    pending: { label: 'nie uruchomiono', icon: 'clock' },
    processing: { label: 'w toku', icon: 'dots' },
    completed: { label: 'gotowe', icon: 'circle-check' },
    failed: { label: 'błąd', icon: 'alert-triangle' },
    unsupported: { label: 'brak obsługi', icon: 'file-text' },
  };
  return statuses[status];
}

/** Outcome of a batch OCR run; a run stops after a time limit and reports what is left. */
export function batchOcrMessage({ processed, remaining }: { processed: number; remaining: number }): string {
  if (!processed && !remaining) return 'Nie ma dokumentów oczekujących na OCR.';
  const done = `Rozpoznano tekst w ${processed} dokumentach.`;
  return remaining ? `${done} Pozostało ${remaining} — uruchom OCR zaległych dokumentów ponownie.` : done;
}
