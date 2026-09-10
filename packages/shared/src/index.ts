export type AssetStatus = 'active' | 'archived' | 'disposed' | 'sold' | 'lost';
export type ItemStatus = 'available' | 'reserved' | 'in_use' | 'in_repair' | 'retired';
export type AssetOptionKind = 'category' | 'location';

export interface AssetOption {
  id: string;
  kind: AssetOptionKind;
  name: string;
}
export type Completeness = 'draft' | 'partial' | 'complete';
export type WarrantyKind = 'fixed' | 'lifetime' | 'unknown';
export type ScheduleKind = 'one_off' | 'recurring';
export type IntervalUnit = 'days' | 'weeks' | 'months' | 'years';

export interface Warranty {
  kind: WarrantyKind;
  scope: string | null;
  expiresOn: string | null;
}

export type AssetFileKind = 'photo' | 'receipt' | 'manual' | 'other';

export interface AssetFile {
  id: string;
  assetId: string;
  kind: AssetFileKind;
  kindLocked: boolean;
  originalName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export interface InboxFile {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export interface DocumentFile {
  id: string;
  documentId: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

export interface BinderDocument {
  id: string;
  name: string;
  type: string | null;
  typeId: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  files: DocumentFile[];
  ocrStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported' | null;
  ocrTextPreview?: string | null;
}

export interface CreateBinderDocumentInput {
  name: string;
  type?: string;
  typeId?: string | null;
  tags?: string[];
  notes?: string;
}

export interface DocumentType {
  id: string;
  name: string;
}

export type TrashKind = 'asset' | 'document';
export interface TrashEntry {
  id: string;
  kind: TrashKind;
  name: string;
  detail: string | null;
  deletedAt: string;
}

export interface MaintenancePlan {
  id: string;
  assetId: string;
  title: string;
  scheduleKind: ScheduleKind;
  intervalValue: number | null;
  intervalUnit: IntervalUnit | null;
  nextDueOn: string | null;
  notes: string | null;
  status: 'active' | 'paused' | 'completed';
  lastCompletedOn?: string | null;
}

export interface MaintenanceRecord {
  id: string;
  planId: string;
  planTitle: string;
  dueOn: string | null;
  status: 'completed' | 'skipped';
  performedOn: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AssetSummary {
  id: string;
  name: string;
  manufacturer: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  purchaseDate: string | null;
  priceMinor: number | null;
  currency: string | null;
  quantity: number;
  externalUrl: string | null;
  notes: string | null;
  tags: string[];
  status: AssetStatus;
  itemStatus: ItemStatus;
  categoryId: string | null;
  categoryName: string | null;
  locationId: string | null;
  locationName: string | null;
  completeness: Completeness;
  createdAt: string;
  updatedAt: string;
  warranty: Warranty | null;
  maintenancePlans?: MaintenancePlan[];
  maintenanceRecords?: MaintenanceRecord[];
  files?: AssetFile[];
}

export interface CreateAssetInput {
  name: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  purchaseDate?: string;
  priceMinor?: number | null;
  currency?: string;
  quantity?: number;
  externalUrl?: string;
  notes?: string;
  tags?: string[];
  itemStatus?: ItemStatus;
  categoryId?: string | null;
  locationId?: string | null;
}

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
}
