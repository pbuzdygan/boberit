import { daysUntil, localDate, type AssetSummary } from '@boberit/shared';
import { warrantyLabel } from './labels.ts';
import type { CollectionFilter, ReminderEntry } from './types';

/** Items whose warranty needs attention, as shown on Start and in the item list (at most two). */
export function attentionAssets(assets: AssetSummary[]): AssetSummary[] {
  return assets.filter((asset) => warrantyLabel(asset).state === 'warning').slice(0, 2);
}

/**
 * Warranty ends and due maintenance within the next 30 days (overdue included), soonest first.
 * A plan completed at least once is listed only when it is due today or earlier.
 */
export function upcomingReminders(assets: AssetSummary[], now: Date = new Date()): ReminderEntry[] {
  const today = localDate(now);
  return assets
    .flatMap((asset): ReminderEntry[] => {
      const warranty = asset.warranty;
      const warrantyEntry =
        warranty?.kind === 'fixed' && warranty.expiresOn
          ? [{ id: `warranty-${asset.id}`, dueOn: warranty.expiresOn, kind: 'warranty' as const, asset }]
          : [];
      const maintenanceEntries = (asset.maintenancePlans ?? [])
        .filter(
          (plan) => plan.status === 'active' && plan.nextDueOn && (!plan.lastCompletedOn || plan.nextDueOn <= today),
        )
        .map((plan) => ({ id: plan.id, dueOn: plan.nextDueOn!, kind: 'maintenance' as const, asset, plan }));
      return [...warrantyEntry, ...maintenanceEntries];
    })
    .filter((entry) => daysUntil(entry.dueOn, now) <= 30)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export function remindersDueToday(reminders: ReminderEntry[], now: Date = new Date()): ReminderEntry[] {
  return reminders.filter((entry) => daysUntil(entry.dueOn, now) === 0);
}

export function filterCollection(assets: AssetSummary[], filter: CollectionFilter): AssetSummary[] {
  return assets.filter(
    (asset) =>
      filter === 'all' ||
      (filter === 'warranty' && asset.warranty && asset.warranty.kind !== 'unknown') ||
      (filter === 'draft' && asset.completeness !== 'complete'),
  );
}

/** Up to two characters of the login for the account avatar; `U` when the login is unknown. */
export function avatarInitials(login: string | undefined): string {
  return Array.from(login?.trim() || 'U')
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('pl-PL');
}
