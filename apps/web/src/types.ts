import type { AssetSummary, MaintenancePlan } from '@boberit/shared';

export type View =
  'start' | 'items' | 'timeline' | 'inbox' | 'binder' | 'document-ocr' | 'trash' | 'settings' | 'search';
/** Settings sections: active household, signed-in account, then application information. */
export type SettingsSection =
  'general' | 'members' | 'data' | 'backup' | 'activity' | 'households' | 'security' | 'integrations' | 'about';
export type TimelineFilter = 'all' | 'maintenance' | 'warranty';
export type CollectionFilter = 'all' | 'warranty' | 'draft';
export type ReminderEntry = {
  id: string;
  dueOn: string;
  kind: 'warranty' | 'maintenance';
  asset: AssetSummary;
  plan?: MaintenancePlan;
};
export type HouseholdMembership = { id: string; name: string; role: string };
export type ToastTone = 'info' | 'error';
export type SetMessage = (message: string | null, tone?: ToastTone) => void;
export type UiNotification = { id: string; message: string; createdAt: number; tone?: ToastTone };
export type PurchaseValue = { currency: string; amountMinor: number };

export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported';
export type OcrDetails = { status: OcrStatus; text: string; error: string | null; updatedAt: string | null };
