import { daysUntil, localDate, type AssetSummary, type MaintenancePlan } from '@boberit/shared';
import { warrantyLabel } from './labels.ts';
import type { CollectionFilter, ReminderEntry } from './types';

/** Items whose warranty needs attention, as shown on Start and in the item list (at most two). */
export function attentionAssets(assets: AssetSummary[]): AssetSummary[] {
  return assets.filter((asset) => warrantyLabel(asset).state === 'warning').slice(0, 2);
}

/** Fixed warranty ends and the next dates of active maintenance plans, soonest first. */
function dueEntries(assets: AssetSummary[], includePlan: (plan: MaintenancePlan) => boolean): ReminderEntry[] {
  return assets
    .flatMap((asset): ReminderEntry[] => {
      const warranty = asset.warranty;
      const warrantyEntry =
        warranty?.kind === 'fixed' && warranty.expiresOn
          ? [{ id: `warranty-${asset.id}`, dueOn: warranty.expiresOn, kind: 'warranty' as const, asset }]
          : [];
      const maintenanceEntries = (asset.maintenancePlans ?? [])
        .filter((plan) => plan.status === 'active' && plan.nextDueOn && includePlan(plan))
        .map((plan) => ({ id: plan.id, dueOn: plan.nextDueOn!, kind: 'maintenance' as const, asset, plan }));
      return [...warrantyEntry, ...maintenanceEntries];
    })
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/**
 * Warranty ends and due maintenance within the next 30 days (overdue included), soonest first.
 * A plan completed at least once is listed only when it is due today or earlier.
 */
export function upcomingReminders(assets: AssetSummary[], now: Date = new Date()): ReminderEntry[] {
  const today = localDate(now);
  return dueEntries(assets, (plan) => !plan.lastCompletedOn || plan.nextDueOn! <= today).filter(
    (entry) => daysUntil(entry.dueOn, now) <= 30,
  );
}

/**
 * Everything on the Terminy page: all fixed warranty ends and the next date of every active plan,
 * including plans already completed once, so their next occurrence is visible right away.
 */
export function timelineEntries(assets: AssetSummary[]): ReminderEntry[] {
  return dueEntries(assets, () => true);
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
