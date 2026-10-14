import type { AssetSummary, MaintenancePlan } from '@boberit/shared';

export type View =
  'start' | 'items' | 'timeline' | 'inbox' | 'binder' | 'document-ocr' | 'trash' | 'settings' | 'account' | 'search';
export type AccountSection = 'households' | 'members' | 'security' | 'webhooks';
export type SettingsSection = 'backup' | 'activity';
export type TimelineFilter = 'all' | 'maintenance' | 'warranty';
export type CollectionFilter = 'all' | 'warranty' | 'draft';
export type ReminderEntry = {
  id: string;
  dueOn: string;
  kind: 'warranty' | 'maintenance';
  asset: AssetSummary;
  plan?: MaintenancePlan;
};
export type UiNotification = { id: string; message: string; createdAt: number };
export type PurchaseValue = { currency: string; amountMinor: number };

export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported';
export type OcrDetails = { status: OcrStatus; text: string; error: string | null; updatedAt: string | null };
