import type {
  AssetFile,
  AssetFileKind,
  AssetOptionKind,
  AssetSummary,
  Completeness,
  CreateAssetInput,
  IntervalUnit,
  ItemStatus,
  MaintenancePlan,
  MaintenanceRecord,
  ScheduleKind,
  Warranty,
  WarrantyKind,
} from '@boberit/shared';
import { randomUUID } from 'node:crypto';
import { database } from './database.js';
import { type Row, now, nullable, tags, parseTags } from './values.js';

export function completeness(input: {
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
}): Completeness {
  const filled = [input.manufacturer, input.modelNumber, input.serialNumber, input.purchaseDate, input.notes].filter(
    (value) => typeof value === 'string' && value.trim(),
  ).length;
  return filled >= 3 ? 'complete' : filled > 0 ? 'partial' : 'draft';
}
function warrantyFor(assetId: string): Warranty | null {
  const row = database.prepare('SELECT kind, scope, expires_on FROM warranties WHERE asset_id = ?').get(assetId) as
    Row | undefined;
  return row
    ? { kind: row.kind as WarrantyKind, scope: nullable(row.scope), expiresOn: nullable(row.expires_on) }
    : null;
}
function filesFor(assetId: string): AssetFile[] {
  return (
    database.prepare('SELECT * FROM asset_files WHERE asset_id = ? ORDER BY created_at DESC').all(assetId) as Row[]
  ).map((row) => ({
    id: String(row.id),
    assetId: String(row.asset_id),
    kind: row.kind as AssetFileKind,
    kindLocked: Number(row.kind_locked ?? 1) === 1,
    originalName: String(row.original_name),
    mimeType: String(row.mime_type),
    byteSize: Number(row.byte_size),
    createdAt: String(row.created_at),
  }));
}
export function plansFor(assetId: string): MaintenancePlan[] {
  return (
    database
      .prepare(
        "SELECT p.*, (SELECT MAX(r.performed_on) FROM maintenance_records r WHERE r.plan_id=p.id AND r.status='completed') AS last_completed_on FROM maintenance_plans p WHERE p.asset_id = ? ORDER BY p.next_due_on ASC",
      )
      .all(assetId) as Row[]
  ).map((row) => ({
    id: String(row.id),
    assetId: String(row.asset_id),
    title: String(row.title),
    scheduleKind: row.schedule_kind as ScheduleKind,
    intervalValue: typeof row.interval_value === 'number' ? row.interval_value : null,
    intervalUnit: nullable(row.interval_unit) as IntervalUnit | null,
    nextDueOn: nullable(row.next_due_on),
    notes: nullable(row.notes),
    status: row.status as MaintenancePlan['status'],
    lastCompletedOn: nullable(row.last_completed_on),
  }));
}
function recordsFor(assetId: string): MaintenanceRecord[] {
  return (
    database
      .prepare(
        `SELECT r.*, p.title AS plan_title FROM maintenance_records r JOIN maintenance_plans p ON p.id = r.plan_id WHERE p.asset_id = ? ORDER BY COALESCE(r.performed_on, r.created_at) DESC, r.created_at DESC`,
      )
      .all(assetId) as Row[]
  ).map((row) => ({
    id: String(row.id),
    planId: String(row.plan_id),
    planTitle: String(row.plan_title),
    dueOn: nullable(row.due_on),
    status: row.status as MaintenanceRecord['status'],
    performedOn: nullable(row.performed_on),
    notes: nullable(row.notes),
    createdAt: String(row.created_at),
  }));
}
function assetFromRow(row: Row, includePlans = false): AssetSummary {
  const category = row.category_id
    ? (database
        .prepare("SELECT name FROM asset_options WHERE id=? AND kind='category'")
        .get(String(row.category_id)) as Row | undefined)
    : undefined;
  const location = row.location_id
    ? (database
        .prepare("SELECT name FROM asset_options WHERE id=? AND kind='location'")
        .get(String(row.location_id)) as Row | undefined)
    : undefined;
  const asset: AssetSummary = {
    id: String(row.id),
    name: String(row.name),
    manufacturer: nullable(row.manufacturer),
    modelNumber: nullable(row.model_number),
    serialNumber: nullable(row.serial_number),
    purchaseDate: nullable(row.purchase_date),
    priceMinor: typeof row.price_minor === 'number' ? row.price_minor : null,
    currency: nullable(row.currency),
    quantity: Number(row.quantity),
    externalUrl: nullable(row.external_url),
    notes: nullable(row.notes),
    tags: parseTags(row.tags_json),
    status: row.status as AssetSummary['status'],
    itemStatus: itemStatus(row.item_status),
    categoryId: category ? String(row.category_id) : null,
    categoryName: category ? String(category.name) : null,
    locationId: location ? String(row.location_id) : null,
    locationName: location ? String(location.name) : null,
    completeness: row.completeness as Completeness,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    warranty: warrantyFor(String(row.id)),
  };
  asset.files = filesFor(asset.id);
  if (includePlans) {
    asset.maintenancePlans = plansFor(asset.id);
    asset.maintenanceRecords = recordsFor(asset.id);
  }
  return asset;
}
export function syncSearch(assetId: string): void {
  const row = database
    .prepare(
      `SELECT a.name,a.manufacturer,a.model_number,a.serial_number,a.notes,a.tags_json,a.item_status,c.name AS category_name,l.name AS location_name FROM assets a LEFT JOIN asset_options c ON c.id=a.category_id LEFT JOIN asset_options l ON l.id=a.location_id WHERE a.id=?`,
    )
    .get(assetId) as Row | undefined;
  if (!row) return;
  const text = [
    row.name,
    row.manufacturer,
    row.model_number,
    row.serial_number,
    row.notes,
    row.category_name,
    row.location_name,
    row.item_status,
    ...parseTags(row.tags_json),
  ]
    .filter(Boolean)
    .join(' ');
  database.prepare('DELETE FROM assets_fts WHERE asset_id = ?').run(assetId);
  database.prepare('INSERT INTO assets_fts(asset_id, search_text) VALUES (?, ?)').run(assetId, text);
}
export function addAssetFile(
  householdId: string,
  assetId: string,
  input: {
    kind: AssetFileKind;
    kindLocked?: boolean;
    originalName: string;
    storedName: string;
    mimeType: string;
    byteSize: number;
  },
): AssetFile | null {
  if (!getAsset(householdId, assetId)) return null;
  const id = randomUUID();
  const createdAt = now();
  const kindLocked = input.kindLocked !== false;
  database
    .prepare(
      'INSERT INTO asset_files(id, asset_id, kind, kind_locked, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      assetId,
      input.kind,
      kindLocked ? 1 : 0,
      input.originalName,
      input.storedName,
      input.mimeType,
      input.byteSize,
      createdAt,
    );
  return {
    id,
    assetId,
    kind: input.kind,
    kindLocked,
    originalName: input.originalName,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    createdAt,
  };
}

export function classifyAssetFile(
  householdId: string,
  assetId: string,
  fileId: string,
  kind: AssetFileKind,
): AssetFile | null {
  const result = database
    .prepare(
      `UPDATE asset_files SET kind=?,kind_locked=1 WHERE id=? AND asset_id=? AND kind_locked=0 AND EXISTS(SELECT 1 FROM assets WHERE id=? AND household_id=? AND deleted_at IS NULL)`,
    )
    .run(kind, fileId, assetId, assetId, householdId);
  return result.changes ? getAssetFile(householdId, fileId) : null;
}

export function getAssetFile(householdId: string, id: string): (AssetFile & { storedName: string }) | null {
  const row = database
    .prepare(
      'SELECT f.* FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE f.id = ? AND a.household_id = ? AND a.deleted_at IS NULL',
    )
    .get(id, householdId) as Row | undefined;
  return row
    ? {
        id: String(row.id),
        assetId: String(row.asset_id),
        kind: row.kind as AssetFileKind,
        kindLocked: Number(row.kind_locked ?? 1) === 1,
        originalName: String(row.original_name),
        storedName: String(row.stored_name),
        mimeType: String(row.mime_type),
        byteSize: Number(row.byte_size),
        createdAt: String(row.created_at),
      }
    : null;
}

export function deleteAssetFile(householdId: string, assetId: string, fileId: string): string | null {
  const row = database
    .prepare(
      'SELECT f.stored_name FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE f.id=? AND f.asset_id=? AND a.household_id=? AND a.deleted_at IS NULL',
    )
    .get(fileId, assetId, householdId) as Row | undefined;
  if (!row) return null;
  database.prepare('DELETE FROM asset_files WHERE id=?').run(fileId);
  return String(row.stored_name);
}

export function listAssets(householdId: string, query = ''): AssetSummary[] {
  let rows: Row[];
  if (query.trim()) {
    rows = database
      .prepare(
        `SELECT a.* FROM assets_fts s JOIN assets a ON a.id = s.asset_id WHERE a.household_id = ? AND a.archived_at IS NULL AND a.deleted_at IS NULL AND search_matches(s.search_text, ?) ORDER BY a.updated_at DESC`,
      )
      .all(householdId, query) as Row[];
  } else {
    rows = database
      .prepare(
        'SELECT * FROM assets WHERE household_id = ? AND archived_at IS NULL AND deleted_at IS NULL ORDER BY updated_at DESC',
      )
      .all(householdId) as Row[];
  }
  return rows.map((row) => assetFromRow(row, true));
}

export function getAsset(householdId: string, id: string): AssetSummary | null {
  const row = database
    .prepare('SELECT * FROM assets WHERE id = ? AND household_id = ? AND archived_at IS NULL AND deleted_at IS NULL')
    .get(id, householdId) as Row | undefined;
  return row ? assetFromRow(row, true) : null;
}

const itemStatuses: ItemStatus[] = ['available', 'reserved', 'in_use', 'in_repair', 'retired'];
function itemStatus(value: unknown, fallback: ItemStatus = 'available'): ItemStatus {
  if (value === undefined || value === null || value === '') return fallback;
  if (!itemStatuses.includes(value as ItemStatus)) throw new Error('Wybrany status przedmiotu jest nieprawidłowy.');
  return value as ItemStatus;
}
function optionId(householdId: string, kind: AssetOptionKind, value: unknown): string | null {
  const id = nullable(value);
  if (!id) return null;
  const row = database
    .prepare('SELECT id FROM asset_options WHERE id=? AND household_id=? AND kind=?')
    .get(id, householdId, kind) as Row | undefined;
  if (!row)
    throw new Error(kind === 'category' ? 'Wybrana kategoria nie istnieje.' : 'Wybrana lokalizacja nie istnieje.');
  return id;
}

export function createAsset(householdId: string, input: CreateAssetInput): AssetSummary {
  const name = input.name.trim();
  if (!name) throw new Error('Nazwa przedmiotu jest wymagana.');
  const id = randomUUID();
  const timestamp = now();
  const normalizedTags = tags(input.tags);
  database
    .prepare(
      `INSERT INTO assets (id, household_id, name, manufacturer, model_number, serial_number, purchase_date, price_minor, currency, quantity, external_url, notes, tags_json, status, item_status, category_id, location_id, completeness, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      householdId,
      name,
      nullable(input.manufacturer),
      nullable(input.modelNumber),
      nullable(input.serialNumber),
      nullable(input.purchaseDate),
      Number.isFinite(input.priceMinor) ? Math.max(0, Math.trunc(input.priceMinor!)) : null,
      nullable(input.currency),
      Math.max(1, Number(input.quantity ?? 1)),
      nullable(input.externalUrl),
      nullable(input.notes),
      JSON.stringify(normalizedTags),
      itemStatus(input.itemStatus),
      optionId(householdId, 'category', input.categoryId),
      optionId(householdId, 'location', input.locationId),
      completeness(input),
      timestamp,
      timestamp,
    );
  syncSearch(id);
  return getAsset(householdId, id)!;
}

export function updateAsset(householdId: string, id: string, input: Partial<CreateAssetInput>): AssetSummary | null {
  const current = getAsset(householdId, id);
  if (!current) return null;
  const next = {
    name: input.name === undefined ? current.name : input.name.trim(),
    manufacturer: input.manufacturer === undefined ? current.manufacturer : nullable(input.manufacturer),
    modelNumber: input.modelNumber === undefined ? current.modelNumber : nullable(input.modelNumber),
    serialNumber: input.serialNumber === undefined ? current.serialNumber : nullable(input.serialNumber),
    purchaseDate: input.purchaseDate === undefined ? current.purchaseDate : nullable(input.purchaseDate),
    priceMinor:
      input.priceMinor === undefined
        ? current.priceMinor
        : Number.isFinite(input.priceMinor)
          ? Math.max(0, Math.trunc(input.priceMinor!))
          : null,
    currency: input.currency === undefined ? current.currency : nullable(input.currency),
    externalUrl: input.externalUrl === undefined ? current.externalUrl : nullable(input.externalUrl),
    quantity: input.quantity === undefined ? current.quantity : Math.max(1, Number(input.quantity)),
    notes: input.notes === undefined ? current.notes : nullable(input.notes),
    tags: input.tags === undefined ? current.tags : tags(input.tags),
    itemStatus: input.itemStatus === undefined ? current.itemStatus : itemStatus(input.itemStatus, current.itemStatus),
    categoryId:
      input.categoryId === undefined ? current.categoryId : optionId(householdId, 'category', input.categoryId),
    locationId:
      input.locationId === undefined ? current.locationId : optionId(householdId, 'location', input.locationId),
  };
  if (!next.name) throw new Error('Nazwa przedmiotu jest wymagana.');
  database
    .prepare(
      `UPDATE assets SET name=?, manufacturer=?, model_number=?, serial_number=?, purchase_date=?, price_minor=?, currency=?, quantity=?, external_url=?, notes=?, tags_json=?, item_status=?, category_id=?, location_id=?, completeness=?, updated_at=? WHERE id=?`,
    )
    .run(
      next.name,
      next.manufacturer,
      next.modelNumber,
      next.serialNumber,
      next.purchaseDate,
      next.priceMinor,
      next.currency,
      next.quantity,
      next.externalUrl,
      next.notes,
      JSON.stringify(next.tags),
      next.itemStatus,
      next.categoryId,
      next.locationId,
      completeness(next),
      now(),
      id,
    );
  syncSearch(id);
  return getAsset(householdId, id);
}

export function saveWarranty(householdId: string, assetId: string, input: Warranty): Warranty | null {
  if (!getAsset(householdId, assetId)) return null;
  if (input.kind === 'fixed' && !input.expiresOn) throw new Error('Data końca gwarancji jest wymagana.');
  if (input.kind !== 'fixed' && input.expiresOn)
    throw new Error('Gwarancja dożywotnia lub nieznana nie może mieć daty końca.');
  const timestamp = now();
  database
    .prepare(
      `INSERT INTO warranties(asset_id, kind, scope, expires_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET kind=excluded.kind, scope=excluded.scope, expires_on=excluded.expires_on, updated_at=excluded.updated_at`,
    )
    .run(assetId, input.kind, nullable(input.scope), nullable(input.expiresOn), timestamp, timestamp);
  return warrantyFor(assetId);
}
