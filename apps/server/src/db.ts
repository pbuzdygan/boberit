import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { AssetFile, AssetFileKind, AssetSummary, BinderDocument, CreateBinderDocumentInput, DocumentFile, InboxFile, TrashEntry, TrashKind, Completeness, CreateAssetInput, IntervalUnit, MaintenancePlan, MaintenanceRecord, ScheduleKind, Warranty, WarrantyKind } from '@boberit/shared';
import { nextDueDate, today } from './maintenance.js';

type Row = Record<string, unknown>;

const dataDirectory = process.env.APP_DATA_DIR ?? join(process.cwd(), 'data');
const databaseDirectory = join(dataDirectory, 'db');
const databasePath = join(databaseDirectory, 'boberit.sqlite');
const legacyDatabasePath = join(dataDirectory, 'boberit.sqlite');
mkdirSync(databaseDirectory, { recursive: true });

if (!existsSync(databasePath) && existsSync(legacyDatabasePath)) {
  for (const suffix of ['', '-wal', '-shm']) {
    const source = legacyDatabasePath + suffix;
    const destination = databasePath + suffix;
    if (existsSync(source)) renameSync(source, destination);
  }
}

export const database = new DatabaseSync(databasePath);
database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

database.exec(`
  CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, user_id TEXT, action TEXT NOT NULL, entity_kind TEXT NOT NULL, entity_id TEXT, label TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS household_members (household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('owner','member')), created_at TEXT NOT NULL, PRIMARY KEY(household_id,user_id));
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, active_household_id TEXT REFERENCES households(id), expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    household_id TEXT,
    name TEXT NOT NULL,
    manufacturer TEXT,
    model_number TEXT,
    serial_number TEXT,
    purchase_date TEXT,
    price_minor INTEGER,
    currency TEXT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
    external_url TEXT,
    notes TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    completeness TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS warranties (
    asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('fixed', 'lifetime', 'unknown')),
    scope TEXT,
    expires_on TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK((kind = 'fixed' AND expires_on IS NOT NULL) OR (kind != 'fixed' AND expires_on IS NULL))
  );
  CREATE TABLE IF NOT EXISTS maintenance_plans (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    schedule_kind TEXT NOT NULL CHECK(schedule_kind IN ('one_off', 'recurring')),
    interval_value INTEGER,
    interval_unit TEXT,
    next_due_on TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS maintenance_records (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES maintenance_plans(id) ON DELETE CASCADE,
    due_on TEXT,
    status TEXT NOT NULL CHECK(status IN ('completed', 'skipped')),
    performed_on TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS asset_files (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('photo', 'receipt', 'manual', 'other')),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inbox_files (
    id TEXT PRIMARY KEY,
    household_id TEXT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    household_id TEXT,
    name TEXT NOT NULL,
    type TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS webhook_deliveries (id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL, event TEXT NOT NULL, status INTEGER, error TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, url TEXT NOT NULL, secret_encrypted TEXT, events_json TEXT NOT NULL, scope_all INTEGER NOT NULL DEFAULT 1, household_ids_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS document_ocr (
    document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('pending','processing','completed','failed','unsupported')),
    text TEXT NOT NULL DEFAULT '', error TEXT, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS document_files (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(document_id UNINDEXED, search_text);
  CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(asset_id UNINDEXED, search_text);
`);
// Existing installations receive the soft-delete columns without losing data.
for (const statement of ['ALTER TABLE assets ADD COLUMN deleted_at TEXT', 'ALTER TABLE documents ADD COLUMN deleted_at TEXT', 'ALTER TABLE assets ADD COLUMN household_id TEXT', 'ALTER TABLE documents ADD COLUMN household_id TEXT', 'ALTER TABLE inbox_files ADD COLUMN household_id TEXT', 'ALTER TABLE sessions ADD COLUMN active_household_id TEXT', 'ALTER TABLE webhooks ADD COLUMN user_id TEXT', 'ALTER TABLE webhooks ADD COLUMN scope_all INTEGER NOT NULL DEFAULT 1', "ALTER TABLE webhooks ADD COLUMN household_ids_json TEXT NOT NULL DEFAULT '[]'"]) {
  try { database.exec(statement); } catch { /* Column already exists. */ }
}
database.exec("UPDATE document_ocr SET status='pending', error=NULL WHERE status='processing'; UPDATE assets SET household_id=(SELECT id FROM households ORDER BY created_at LIMIT 1) WHERE household_id IS NULL AND EXISTS(SELECT 1 FROM households); UPDATE documents SET household_id=(SELECT id FROM households ORDER BY created_at LIMIT 1) WHERE household_id IS NULL AND EXISTS(SELECT 1 FROM households); UPDATE inbox_files SET household_id=(SELECT id FROM households ORDER BY created_at LIMIT 1) WHERE household_id IS NULL AND EXISTS(SELECT 1 FROM households); UPDATE sessions SET active_household_id=(SELECT m.household_id FROM household_members m WHERE m.user_id=sessions.user_id ORDER BY m.created_at LIMIT 1) WHERE active_household_id IS NULL; UPDATE webhooks SET user_id=(SELECT id FROM users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL AND EXISTS(SELECT 1 FROM users);");

function now(): string { return new Date().toISOString(); }
function nullable(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean))].slice(0, 12);
}
function parseTags(raw: unknown): string[] {
  try { return JSON.parse(String(raw ?? '[]')) as string[]; } catch { return []; }
}
function completeness(input: { manufacturer?: string | null; modelNumber?: string | null; serialNumber?: string | null; purchaseDate?: string | null; notes?: string | null }): Completeness {
  const filled = [input.manufacturer, input.modelNumber, input.serialNumber, input.purchaseDate, input.notes].filter((value) => typeof value === 'string' && value.trim()).length;
  return filled >= 3 ? 'complete' : filled > 0 ? 'partial' : 'draft';
}
function warrantyFor(assetId: string): Warranty | null {
  const row = database.prepare('SELECT kind, scope, expires_on FROM warranties WHERE asset_id = ?').get(assetId) as Row | undefined;
  return row ? { kind: row.kind as WarrantyKind, scope: nullable(row.scope), expiresOn: nullable(row.expires_on) } : null;
}
function filesFor(assetId: string): AssetFile[] {
  return (database.prepare('SELECT * FROM asset_files WHERE asset_id = ? ORDER BY created_at DESC').all(assetId) as Row[]).map((row) => ({
    id: String(row.id), assetId: String(row.asset_id), kind: row.kind as AssetFileKind, originalName: String(row.original_name),
    mimeType: String(row.mime_type), byteSize: Number(row.byte_size), createdAt: String(row.created_at),
  }));
}
function plansFor(assetId: string): MaintenancePlan[] {
  return (database.prepare('SELECT p.*, (SELECT MAX(r.performed_on) FROM maintenance_records r WHERE r.plan_id=p.id AND r.status=\'completed\') AS last_completed_on FROM maintenance_plans p WHERE p.asset_id = ? ORDER BY p.next_due_on ASC').all(assetId) as Row[]).map((row) => ({
    id: String(row.id), assetId: String(row.asset_id), title: String(row.title),
    scheduleKind: row.schedule_kind as ScheduleKind,
    intervalValue: typeof row.interval_value === 'number' ? row.interval_value : null,
    intervalUnit: nullable(row.interval_unit) as IntervalUnit | null,
    nextDueOn: nullable(row.next_due_on), notes: nullable(row.notes),
    status: row.status as MaintenancePlan['status'], lastCompletedOn: nullable(row.last_completed_on),
  }));
}
function recordsFor(assetId: string): MaintenanceRecord[] {
  return (database.prepare(`SELECT r.*, p.title AS plan_title FROM maintenance_records r JOIN maintenance_plans p ON p.id = r.plan_id WHERE p.asset_id = ? ORDER BY COALESCE(r.performed_on, r.created_at) DESC, r.created_at DESC`).all(assetId) as Row[]).map((row) => ({
    id: String(row.id), planId: String(row.plan_id), planTitle: String(row.plan_title), dueOn: nullable(row.due_on),
    status: row.status as MaintenanceRecord['status'], performedOn: nullable(row.performed_on), notes: nullable(row.notes), createdAt: String(row.created_at),
  }));
}
function assetFromRow(row: Row, includePlans = false): AssetSummary {
  const asset: AssetSummary = {
    id: String(row.id), name: String(row.name), manufacturer: nullable(row.manufacturer),
    modelNumber: nullable(row.model_number), serialNumber: nullable(row.serial_number),
    purchaseDate: nullable(row.purchase_date), priceMinor: typeof row.price_minor === 'number' ? row.price_minor : null,
    currency: nullable(row.currency), quantity: Number(row.quantity), externalUrl: nullable(row.external_url),
    notes: nullable(row.notes), tags: parseTags(row.tags_json), status: row.status as AssetSummary['status'],
    completeness: row.completeness as Completeness, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    warranty: warrantyFor(String(row.id)),
  };
  asset.files = filesFor(asset.id);
  if (includePlans) { asset.maintenancePlans = plansFor(asset.id); asset.maintenanceRecords = recordsFor(asset.id); }
  return asset;
}
function syncSearch(assetId: string): void {
  const row = database.prepare('SELECT name, manufacturer, model_number, serial_number, notes, tags_json FROM assets WHERE id = ?').get(assetId) as Row | undefined;
  if (!row) return;
  const text = [row.name, row.manufacturer, row.model_number, row.serial_number, row.notes, ...parseTags(row.tags_json)].filter(Boolean).join(' ');
  database.prepare('DELETE FROM assets_fts WHERE asset_id = ?').run(assetId);
  database.prepare('INSERT INTO assets_fts(asset_id, search_text) VALUES (?, ?)').run(assetId, text);
}
export function addAssetFile(householdId: string, assetId: string, input: { kind: AssetFileKind; originalName: string; storedName: string; mimeType: string; byteSize: number }): AssetFile | null {
  if (!getAsset(householdId, assetId)) return null;
  const id = randomUUID();
  const createdAt = now();
  database.prepare('INSERT INTO asset_files(id, asset_id, kind, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, assetId, input.kind, input.originalName, input.storedName, input.mimeType, input.byteSize, createdAt);
  return { id, assetId, kind: input.kind, originalName: input.originalName, mimeType: input.mimeType, byteSize: input.byteSize, createdAt };
}

export function getAssetFile(householdId: string, id: string): (AssetFile & { storedName: string }) | null {
  const row = database.prepare('SELECT f.* FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE f.id = ? AND a.household_id = ? AND a.deleted_at IS NULL').get(id, householdId) as Row | undefined;
  return row ? { id: String(row.id), assetId: String(row.asset_id), kind: row.kind as AssetFileKind, originalName: String(row.original_name), storedName: String(row.stored_name), mimeType: String(row.mime_type), byteSize: Number(row.byte_size), createdAt: String(row.created_at) } : null;
}

export function deleteAssetFile(householdId: string, assetId: string, fileId: string): string | null {
  const row = database.prepare("SELECT f.stored_name FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE f.id=? AND f.asset_id=? AND a.household_id=? AND a.deleted_at IS NULL").get(fileId, assetId, householdId) as Row | undefined;
  if (!row) return null;
  database.prepare("DELETE FROM asset_files WHERE id=?").run(fileId);
  return String(row.stored_name);
}

function inboxFromRow(row: Row): InboxFile & { storedName: string } {
  return { id: String(row.id), originalName: String(row.original_name), storedName: String(row.stored_name), mimeType: String(row.mime_type), byteSize: Number(row.byte_size), createdAt: String(row.created_at) };
}
export function listInboxFiles(householdId: string): InboxFile[] {
  return (database.prepare('SELECT * FROM inbox_files WHERE household_id=? ORDER BY created_at DESC').all(householdId) as Row[]).map((row) => {
    const { storedName: _storedName, ...file } = inboxFromRow(row);
    return file;
  });
}
export function getInboxFile(householdId: string, id: string): (InboxFile & { storedName: string }) | null {
  const row = database.prepare('SELECT * FROM inbox_files WHERE id = ? AND household_id = ?').get(id, householdId) as Row | undefined;
  return row ? inboxFromRow(row) : null;
}
export function addInboxFile(householdId: string, input: { originalName: string; storedName: string; mimeType: string; byteSize: number }): InboxFile {
  const id = randomUUID(); const createdAt = now();
  database.prepare('INSERT INTO inbox_files(id, household_id, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, householdId, input.originalName, input.storedName, input.mimeType, input.byteSize, createdAt);
  return { id, originalName: input.originalName, mimeType: input.mimeType, byteSize: input.byteSize, createdAt };
}
export function deleteInboxFile(householdId: string, id: string): string | null {
  const source = getInboxFile(householdId, id);
  if (!source) return null;
  database.prepare('DELETE FROM inbox_files WHERE id = ?').run(id);
  return source.storedName;
}
export function assignInboxFile(householdId: string, id: string, assetId: string, kind: AssetFileKind): AssetFile | null {
  if (!getAsset(householdId, assetId)) return null;
  const source = getInboxFile(householdId, id);
  if (!source) return null;
  database.exec('BEGIN');
  try {
    database.prepare('INSERT INTO asset_files(id, asset_id, kind, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(source.id, assetId, kind, source.originalName, source.storedName, source.mimeType, source.byteSize, source.createdAt);
    database.prepare('DELETE FROM inbox_files WHERE id = ?').run(id);
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); throw error; }
  return { id: source.id, assetId, kind, originalName: source.originalName, mimeType: source.mimeType, byteSize: source.byteSize, createdAt: source.createdAt };
}

function documentFilesFor(documentId: string): DocumentFile[] {
  return (database.prepare('SELECT * FROM document_files WHERE document_id = ? ORDER BY created_at DESC').all(documentId) as Row[]).map((row) => ({ id: String(row.id), documentId: String(row.document_id), originalName: String(row.original_name), mimeType: String(row.mime_type), byteSize: Number(row.byte_size), createdAt: String(row.created_at) }));
}
function documentFromRow(row: Row): BinderDocument {
  const id = String(row.id);
  const ocr=database.prepare('SELECT status,text FROM document_ocr WHERE document_id=?').get(id) as Row|undefined; return { id, name: String(row.name), type: nullable(row.type), tags: parseTags(row.tags_json), notes: nullable(row.notes), createdAt: String(row.created_at), updatedAt: String(row.updated_at), files: documentFilesFor(id), ocrStatus: ocr?String(ocr.status):null, ocrTextPreview: ocr?.text?String(ocr.text).slice(0,180):null } as BinderDocument;
}
function syncDocumentSearch(documentId: string): void {
  const row = database.prepare('SELECT d.name, d.type, d.tags_json, d.notes, o.text AS ocr_text FROM documents d LEFT JOIN document_ocr o ON o.document_id=d.id WHERE d.id = ?').get(documentId) as Row | undefined;
  if (!row) return;
  const text = [row.name, row.type, row.notes, row.ocr_text, ...parseTags(row.tags_json)].filter(Boolean).join(' ');
  database.prepare('DELETE FROM documents_fts WHERE document_id = ?').run(documentId);
  database.prepare('INSERT INTO documents_fts(document_id, search_text) VALUES (?, ?)').run(documentId, text);
}
export function documentFilesForOcr(householdId:string,documentId:string):Row[]{return database.prepare('SELECT f.id,f.original_name,f.stored_name,f.mime_type FROM document_files f JOIN documents d ON d.id=f.document_id WHERE f.document_id=? AND d.household_id=? AND d.deleted_at IS NULL ORDER BY f.created_at').all(documentId,householdId) as Row[];}
export function setDocumentOcr(householdId:string,documentId:string,status:'pending'|'processing'|'completed'|'failed'|'unsupported',text='',error:string|null=null):boolean{const found=database.prepare('SELECT id FROM documents WHERE id=? AND household_id=? AND deleted_at IS NULL').get(documentId,householdId) as Row|undefined;if(!found)return false;database.prepare("INSERT INTO document_ocr(document_id,status,text,error,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET status=excluded.status,text=excluded.text,error=excluded.error,updated_at=excluded.updated_at").run(documentId,status,text,error,now());syncDocumentSearch(documentId);return true;}
export function getDocumentOcr(householdId:string,documentId:string):Row|null{const row=database.prepare('SELECT o.status,o.text,o.error,o.updated_at FROM document_ocr o JOIN documents d ON d.id=o.document_id WHERE o.document_id=? AND d.household_id=? AND d.deleted_at IS NULL').get(documentId,householdId) as Row|undefined;return row??null;}
export function saveDocumentOcrText(householdId:string,documentId:string,text:string):boolean{return setDocumentOcr(householdId,documentId,'completed',text.slice(0,2_000_000),null);}
export function documentsNeedingOcr(householdId:string,limit=1000):Row[]{return database.prepare("SELECT d.id FROM documents d WHERE d.household_id=? AND d.deleted_at IS NULL AND EXISTS(SELECT 1 FROM document_files f WHERE f.document_id=d.id) AND (NOT EXISTS(SELECT 1 FROM document_ocr o WHERE o.document_id=d.id) OR EXISTS(SELECT 1 FROM document_ocr o WHERE o.document_id=d.id AND o.status IN ('pending','failed'))) ORDER BY d.updated_at DESC LIMIT ?").all(householdId,limit) as Row[];}
export function listDocuments(householdId: string, query = ''): BinderDocument[] {
  const rows = query.trim()
    ? database.prepare('SELECT d.* FROM documents d WHERE d.household_id = ? AND d.deleted_at IS NULL AND d.id IN (SELECT document_id FROM documents_fts WHERE documents_fts MATCH ?) ORDER BY d.updated_at DESC').all(householdId, ftsQuery(query)) as Row[]
    : database.prepare('SELECT * FROM documents WHERE household_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC').all(householdId) as Row[];
  return rows.map(documentFromRow);
}
export function createDocument(householdId: string, input: CreateBinderDocumentInput): BinderDocument {
  const name = input.name.trim(); if (!name) throw new Error('Nazwa dokumentu jest wymagana.');
  const id = randomUUID(); const timestamp = now();
  database.prepare('INSERT INTO documents(id, household_id, name, type, tags_json, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, householdId, name, nullable(input.type), JSON.stringify(tags(input.tags)), nullable(input.notes), timestamp, timestamp);
  syncDocumentSearch(id);
  return documentFromRow(database.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Row);
}
export function updateDocument(householdId: string, id: string, input: Partial<CreateBinderDocumentInput>): BinderDocument | null {
  const current = database.prepare('SELECT * FROM documents WHERE id = ? AND household_id = ?').get(id, householdId) as Row | undefined;
  if (!current) return null;
  const name = input.name === undefined ? String(current.name) : input.name.trim();
  if (!name) throw new Error('Nazwa dokumentu jest wymagana.');
  const type = input.type === undefined ? nullable(current.type) : nullable(input.type);
  const nextTags = input.tags === undefined ? parseTags(current.tags_json) : tags(input.tags);
  const notes = input.notes === undefined ? nullable(current.notes) : nullable(input.notes);
  database.prepare('UPDATE documents SET name=?, type=?, tags_json=?, notes=?, updated_at=? WHERE id=?')
    .run(name, type, JSON.stringify(nextTags), notes, now(), id);
  syncDocumentSearch(id);
  return documentFromRow(database.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Row);
}
export function addDocumentFile(householdId: string, documentId: string, input: { originalName: string; storedName: string; mimeType: string; byteSize: number }): DocumentFile | null {
  const exists = database.prepare('SELECT id FROM documents WHERE id = ? AND household_id = ?').get(documentId, householdId) as Row | undefined;
  if (!exists) return null;
  const id = randomUUID(); const createdAt = now();
  database.prepare('INSERT INTO document_files(id, document_id, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, documentId, input.originalName, input.storedName, input.mimeType, input.byteSize, createdAt);
  database.prepare('UPDATE documents SET updated_at=? WHERE id=?').run(now(), documentId);
  return { id, documentId, originalName: input.originalName, mimeType: input.mimeType, byteSize: input.byteSize, createdAt };
}

export function getDocumentFile(householdId: string, id: string): (DocumentFile & { storedName: string }) | null {
  const row = database.prepare('SELECT f.* FROM document_files f JOIN documents d ON d.id=f.document_id WHERE f.id = ? AND d.household_id = ? AND d.deleted_at IS NULL').get(id, householdId) as Row | undefined;
  return row ? { id: String(row.id), documentId: String(row.document_id), originalName: String(row.original_name), storedName: String(row.stored_name), mimeType: String(row.mime_type), byteSize: Number(row.byte_size), createdAt: String(row.created_at) } : null;
}

export function deleteDocumentFile(householdId: string, documentId: string, fileId: string): { storedName: string; remainingFiles: number } | null {
  const source = database.prepare("SELECT f.stored_name FROM document_files f JOIN documents d ON d.id=f.document_id WHERE f.id=? AND f.document_id=? AND d.household_id=? AND d.deleted_at IS NULL").get(fileId, documentId, householdId) as Row | undefined;
  if (!source) return null;
  database.prepare("DELETE FROM document_files WHERE id=?").run(fileId);
  database.prepare("UPDATE documents SET updated_at=? WHERE id=?").run(now(), documentId);
  const remaining = database.prepare("SELECT COUNT(*) AS count FROM document_files WHERE document_id=?").get(documentId) as Row;
  return { storedName: String(source.stored_name), remainingFiles: Number(remaining.count) };
}

export function assignInboxToDocument(householdId: string, id: string, input: CreateBinderDocumentInput): BinderDocument | null {
  const source = getInboxFile(householdId, id); if (!source) return null;
  const name = input.name.trim(); if (!name) throw new Error('Nazwa dokumentu jest wymagana.');
  const documentId = randomUUID(); const timestamp = now();
  database.exec('BEGIN');
  try {
    database.prepare('INSERT INTO documents(id, household_id, name, type, tags_json, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(documentId, householdId, name, nullable(input.type), JSON.stringify(tags(input.tags)), nullable(input.notes), timestamp, timestamp);
    database.prepare('INSERT INTO document_files(id, document_id, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(source.id, documentId, source.originalName, source.storedName, source.mimeType, source.byteSize, source.createdAt);
    database.prepare('DELETE FROM inbox_files WHERE id = ?').run(id);
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); throw error; }
  syncDocumentSearch(documentId);
  return documentFromRow(database.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as Row);
}

function ftsQuery(query: string): string {
  return query.trim().split(/\s+/).map((token) => `"${token.replaceAll('"', '')}"*`).join(' AND ');
}

export function listAssets(householdId: string, query = ''): AssetSummary[] {
  let rows: Row[];
  if (query.trim()) {
    rows = database.prepare(`SELECT a.* FROM assets a WHERE a.household_id = ? AND a.archived_at IS NULL AND a.deleted_at IS NULL AND a.id IN (SELECT asset_id FROM assets_fts WHERE assets_fts MATCH ?) ORDER BY a.updated_at DESC`).all(householdId, ftsQuery(query)) as Row[];
  } else {
    rows = database.prepare('SELECT * FROM assets WHERE household_id = ? AND archived_at IS NULL AND deleted_at IS NULL ORDER BY updated_at DESC').all(householdId) as Row[];
  }
  return rows.map((row) => assetFromRow(row, true));
}

export function getAsset(householdId: string, id: string): AssetSummary | null {
  const row = database.prepare('SELECT * FROM assets WHERE id = ? AND household_id = ? AND archived_at IS NULL AND deleted_at IS NULL').get(id, householdId) as Row | undefined;
  return row ? assetFromRow(row, true) : null;
}

export function createAsset(householdId: string, input: CreateAssetInput): AssetSummary {
  const name = input.name.trim();
  if (!name) throw new Error('Nazwa przedmiotu jest wymagana.');
  const id = randomUUID();
  const timestamp = now();
  const normalizedTags = tags(input.tags);
  database.prepare(`INSERT INTO assets (id, household_id, name, manufacturer, model_number, serial_number, purchase_date, price_minor, currency, quantity, external_url, notes, tags_json, status, completeness, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`)
    .run(id, householdId, name, nullable(input.manufacturer), nullable(input.modelNumber), nullable(input.serialNumber), nullable(input.purchaseDate), Number.isFinite(input.priceMinor) ? Math.max(0, Math.trunc(input.priceMinor!)) : null, nullable(input.currency), Math.max(1, Number(input.quantity ?? 1)), nullable(input.externalUrl), nullable(input.notes), JSON.stringify(normalizedTags), completeness(input), timestamp, timestamp);
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
    priceMinor: input.priceMinor === undefined ? current.priceMinor : (Number.isFinite(input.priceMinor) ? Math.max(0, Math.trunc(input.priceMinor!)) : null),
    currency: input.currency === undefined ? current.currency : nullable(input.currency),
    externalUrl: input.externalUrl === undefined ? current.externalUrl : nullable(input.externalUrl),
    quantity: input.quantity === undefined ? current.quantity : Math.max(1, Number(input.quantity)),
    notes: input.notes === undefined ? current.notes : nullable(input.notes),
    tags: input.tags === undefined ? current.tags : tags(input.tags),
  };
  if (!next.name) throw new Error('Nazwa przedmiotu jest wymagana.');
  database.prepare(`UPDATE assets SET name=?, manufacturer=?, model_number=?, serial_number=?, purchase_date=?, price_minor=?, currency=?, quantity=?, external_url=?, notes=?, tags_json=?, completeness=?, updated_at=? WHERE id=?`)
    .run(next.name, next.manufacturer, next.modelNumber, next.serialNumber, next.purchaseDate, next.priceMinor, next.currency, next.quantity, next.externalUrl, next.notes, JSON.stringify(next.tags), completeness(next), now(), id);
  syncSearch(id);
  return getAsset(householdId, id);
}

export function saveWarranty(householdId: string, assetId: string, input: Warranty): Warranty | null {
  if (!getAsset(householdId, assetId)) return null;
  if (input.kind === 'fixed' && !input.expiresOn) throw new Error('Data końca gwarancji jest wymagana.');
  if (input.kind !== 'fixed' && input.expiresOn) throw new Error('Gwarancja dożywotnia lub nieznana nie może mieć daty końca.');
  const timestamp = now();
  database.prepare(`INSERT INTO warranties(asset_id, kind, scope, expires_on, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(asset_id) DO UPDATE SET kind=excluded.kind, scope=excluded.scope, expires_on=excluded.expires_on, updated_at=excluded.updated_at`)
    .run(assetId, input.kind, nullable(input.scope), nullable(input.expiresOn), timestamp, timestamp);
  return warrantyFor(assetId);
}

export function createMaintenancePlan(householdId: string, assetId: string, input: { title: string; scheduleKind: ScheduleKind; intervalValue?: number; intervalUnit?: IntervalUnit; nextDueOn?: string; notes?: string }): MaintenancePlan | null {
  if (!getAsset(householdId, assetId)) return null;
  const title = input.title.trim();
  if (!title) throw new Error('Nazwa planu jest wymagana.');
  if (input.scheduleKind === 'recurring' && (!input.intervalValue || !input.intervalUnit)) throw new Error('Plan cykliczny wymaga interwału.');
  const id = randomUUID(); const timestamp = now();
  database.prepare(`INSERT INTO maintenance_plans(id, asset_id, title, schedule_kind, interval_value, interval_unit, next_due_on, notes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
    .run(id, assetId, title, input.scheduleKind, input.scheduleKind === 'recurring' ? Math.max(1, Number(input.intervalValue)) : null, input.scheduleKind === 'recurring' ? input.intervalUnit ?? null : null, nullable(input.nextDueOn), nullable(input.notes), timestamp, timestamp);
  return plansFor(assetId).find((plan) => plan.id === id) ?? null;
}

export function updateMaintenancePlan(householdId: string, id: string, input: { title: string; scheduleKind: ScheduleKind; intervalValue?: number | null; intervalUnit?: IntervalUnit | null; nextDueOn?: string | null; notes?: string | null }): MaintenancePlan | null {
  const row = database.prepare("SELECT p.asset_id FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE p.id=? AND a.household_id=? AND a.deleted_at IS NULL").get(id, householdId) as Row | undefined;
  if (!row) return null;
  const title = input.title.trim();
  if (!title) throw new Error("Nazwa planu jest wymagana.");
  if (input.scheduleKind === "recurring" && (!input.intervalValue || !input.intervalUnit)) throw new Error("Plan cykliczny wymaga interwału.");
  database.prepare("UPDATE maintenance_plans SET title=?, schedule_kind=?, interval_value=?, interval_unit=?, next_due_on=?, notes=?, updated_at=? WHERE id=?").run(title, input.scheduleKind, input.scheduleKind === "recurring" ? Math.max(1, Number(input.intervalValue)) : null, input.scheduleKind === "recurring" ? input.intervalUnit ?? null : null, nullable(input.nextDueOn), nullable(input.notes), now(), id);
  return plansFor(String(row.asset_id)).find((plan) => plan.id === id) ?? null;
}

export function deleteMaintenancePlan(householdId: string, id: string): boolean {
  const row = database.prepare("SELECT p.id FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE p.id=? AND a.household_id=? AND a.deleted_at IS NULL").get(id, householdId) as Row | undefined;
  if (!row) return false;
  database.exec("BEGIN");
  try {
    database.prepare("DELETE FROM maintenance_records WHERE plan_id=?").run(id);
    database.prepare("DELETE FROM maintenance_plans WHERE id=?").run(id);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  return true;
}

export function completeMaintenancePlan(householdId: string, id: string, input: { performedOn?: string; notes?: string }): MaintenancePlan | null {
  const plan = database.prepare('SELECT p.* FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE p.id = ? AND a.household_id = ?').get(id, householdId) as Row | undefined;
  if (!plan) return null;
  const performedOn = nullable(input.performedOn) ?? today();
  database.prepare('INSERT INTO maintenance_records(id, plan_id, due_on, status, performed_on, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), id, nullable(plan.next_due_on), 'completed', performedOn, nullable(input.notes), now());
  let nextDueOn: string | null = null;
  let status = 'completed';
  if (plan.schedule_kind === 'recurring') {
    nextDueOn = nextDueDate(performedOn, Number(plan.interval_value), plan.interval_unit as IntervalUnit);
    status = 'active';
  }
  database.prepare('UPDATE maintenance_plans SET next_due_on=?, status=?, updated_at=? WHERE id=?').run(nextDueOn, status, now(), id);
  return plansFor(String(plan.asset_id)).find((entry) => entry.id === id) ?? null;
}


export function moveAssetToTrash(householdId: string, id: string): boolean {
  const result = database.prepare('UPDATE assets SET deleted_at=?, updated_at=? WHERE id=? AND household_id=? AND deleted_at IS NULL').run(now(), now(), id, householdId);
  return result.changes > 0;
}
export function moveDocumentToTrash(householdId: string, id: string): boolean {
  const result = database.prepare('UPDATE documents SET deleted_at=?, updated_at=? WHERE id=? AND household_id=? AND deleted_at IS NULL').run(now(), now(), id, householdId);
  return result.changes > 0;
}
export function restoreTrashEntry(householdId: string, kind: TrashKind, id: string): boolean {
  const table = kind === 'asset' ? 'assets' : 'documents';
  const result = database.prepare(`UPDATE ${table} SET deleted_at=NULL, updated_at=? WHERE id=? AND household_id=? AND deleted_at IS NOT NULL`).run(now(), id, householdId);
  if (result.changes && kind === 'asset') syncSearch(id);
  if (result.changes && kind === 'document') syncDocumentSearch(id);
  return result.changes > 0;
}
export function listTrash(householdId: string, kind?: TrashKind): TrashEntry[] {
  const entries: TrashEntry[] = [];
  if (!kind || kind === 'asset') entries.push(...(database.prepare("SELECT id, name, manufacturer, model_number, deleted_at FROM assets WHERE household_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC").all(householdId) as Row[]).map((row) => ({ id: String(row.id), kind: 'asset' as const, name: String(row.name), detail: [nullable(row.manufacturer), nullable(row.model_number)].filter(Boolean).join(' · ') || null, deletedAt: String(row.deleted_at) })));
  if (!kind || kind === 'document') entries.push(...(database.prepare("SELECT id, name, type, deleted_at FROM documents WHERE household_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC").all(householdId) as Row[]).map((row) => ({ id: String(row.id), kind: 'document' as const, name: String(row.name), detail: nullable(row.type), deletedAt: String(row.deleted_at) })));
  return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
function storedNamesForDeleted(before?: string): string[] {
  const condition = before ? 'deleted_at IS NOT NULL AND deleted_at <= ?' : 'deleted_at IS NOT NULL';
  const parameter = before ? [before] : [];
  const assetRows = database.prepare(`SELECT f.stored_name FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE a.${condition}`).all(...parameter) as Row[];
  const documentRows = database.prepare(`SELECT f.stored_name FROM document_files f JOIN documents d ON d.id=f.document_id WHERE d.${condition}`).all(...parameter) as Row[];
  return [...assetRows, ...documentRows].map((row) => String(row.stored_name));
}
export function permanentlyDeleteTrash(before?: string): string[] {
  const names = storedNamesForDeleted(before);
  const condition = before ? 'deleted_at IS NOT NULL AND deleted_at <= ?' : 'deleted_at IS NOT NULL';
  const parameter = before ? [before] : [];
  database.prepare(`DELETE FROM assets WHERE ${condition}`).run(...parameter);
  database.prepare(`DELETE FROM documents WHERE ${condition}`).run(...parameter);
  return names;
}





export function hasUsers(): boolean { return Number((database.prepare('SELECT COUNT(*) AS count FROM users').get() as Row).count)>0; }
export function createUserAccount(input:{login:string;email:string;passwordHash:string;householdName:string}): {id:string;login:string;email:string;householdId:string} { const id=randomUUID(),householdId=randomUUID(),stamp=now(); database.exec('BEGIN'); try { database.prepare('INSERT INTO users(id,login,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(id,input.login,input.email,input.passwordHash,stamp); database.prepare('INSERT INTO households(id,name,created_at) VALUES(?,?,?)').run(householdId,input.householdName,stamp); database.prepare("INSERT INTO household_members(household_id,user_id,role,created_at) VALUES(?,?, 'owner',?)").run(householdId,id,stamp); database.prepare('UPDATE assets SET household_id=? WHERE household_id IS NULL').run(householdId); database.prepare('UPDATE documents SET household_id=? WHERE household_id IS NULL').run(householdId); database.exec('COMMIT'); return {id,login:input.login,email:input.email,householdId}; } catch(e){database.exec('ROLLBACK');throw e;} }
export function userByLogin(login:string): Row|undefined{return database.prepare('SELECT * FROM users WHERE login=? OR email=?').get(login,login) as Row|undefined;}

export function createHouseholdMember(input:{householdId:string;login:string;email:string;passwordHash:string;role:'owner'|'member'}): {id:string;login:string;email:string;role:string} { const id=randomUUID(),stamp=now(); database.exec('BEGIN'); try { database.prepare('INSERT INTO users(id,login,email,password_hash,created_at) VALUES(?,?,?,?,?)').run(id,input.login,input.email,input.passwordHash,stamp); database.prepare('INSERT INTO household_members(household_id,user_id,role,created_at) VALUES(?,?,?,?)').run(input.householdId,id,input.role,stamp); database.exec('COMMIT');return{id,login:input.login,email:input.email,role:input.role};}catch(e){database.exec('ROLLBACK');throw e;} }
export function listHouseholdMembers(householdId:string): Row[]{return database.prepare('SELECT u.id,u.login,u.email,m.role,m.created_at FROM household_members m JOIN users u ON u.id=m.user_id WHERE m.household_id=? ORDER BY m.created_at').all(householdId) as Row[];}
export function updateHouseholdMemberRole(householdId:string,userId:string,role:'owner'|'member'):boolean{const current=database.prepare('SELECT role FROM household_members WHERE household_id=? AND user_id=?').get(householdId,userId) as Row|undefined;if(!current)return false;if(String(current.role)==='owner'&&role==='member'){const owners=database.prepare("SELECT COUNT(*) AS count FROM household_members WHERE household_id=? AND role='owner'").get(householdId) as Row;if(Number(owners.count)<=1)throw new Error('Gospodarstwo musi mieć co najmniej jednego właściciela.');}return database.prepare('UPDATE household_members SET role=? WHERE household_id=? AND user_id=?').run(role,householdId,userId).changes>0;}
export function removeHouseholdMember(householdId:string,userId:string):boolean{const current=database.prepare('SELECT role FROM household_members WHERE household_id=? AND user_id=?').get(householdId,userId) as Row|undefined;if(!current)return false;if(String(current.role)==='owner'){const owners=database.prepare("SELECT COUNT(*) AS count FROM household_members WHERE household_id=? AND role='owner'").get(householdId) as Row;if(Number(owners.count)<=1)throw new Error('Nie można usunąć ostatniego właściciela gospodarstwa.');}return database.prepare('DELETE FROM household_members WHERE household_id=? AND user_id=?').run(householdId,userId).changes>0;}

export function sessionUser(tokenHash:string): Row|undefined { return database.prepare('SELECT u.id,u.login,u.email,m.household_id,m.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN household_members m ON m.user_id=u.id AND m.household_id=s.active_household_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash,now()) as Row|undefined; }
export function listUserHouseholds(userId:string):Row[]{return database.prepare('SELECT h.id,h.name,m.role FROM household_members m JOIN households h ON h.id=m.household_id WHERE m.user_id=? ORDER BY h.name').all(userId) as Row[];}
export function createHouseholdForUser(userId:string,name:string):Row{const id=randomUUID(),stamp=now();database.exec('BEGIN');try{database.prepare('INSERT INTO households(id,name,created_at) VALUES(?,?,?)').run(id,name.trim(),stamp);database.prepare("INSERT INTO household_members(household_id,user_id,role,created_at) VALUES(?,?, 'owner',?)").run(id,userId,stamp);database.exec('COMMIT');return{id,name:name.trim(),role:'owner'};}catch(error){database.exec('ROLLBACK');throw error;}}
export function renameHousehold(userId:string,householdId:string,name:string):boolean{return database.prepare("UPDATE households SET name=? WHERE id=? AND EXISTS(SELECT 1 FROM household_members WHERE household_id=? AND user_id=? AND role='owner')").run(name.trim(),householdId,householdId,userId).changes>0;}
export function setActiveHousehold(tokenHash:string,userId:string,householdId:string):boolean{return database.prepare('UPDATE sessions SET active_household_id=? WHERE token_hash=? AND user_id=? AND EXISTS(SELECT 1 FROM household_members WHERE user_id=? AND household_id=?)').run(householdId,tokenHash,userId,userId,householdId).changes>0;}
export function createSession(userId:string,tokenHash:string):string{const id=randomUUID(),expires=new Date(Date.now()+30*86400000).toISOString();const member=database.prepare('SELECT household_id FROM household_members WHERE user_id=? ORDER BY created_at LIMIT 1').get(userId) as Row|undefined;database.prepare('INSERT INTO sessions(id,user_id,token_hash,active_household_id,expires_at,created_at) VALUES(?,?,?,?,?,?)').run(id,userId,tokenHash,(member?.household_id as string|undefined)??null,expires,now());return expires;}
export function deleteSession(tokenHash:string):boolean{return database.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash).changes>0;}
export function deleteOtherSessions(userId:string,tokenHash:string):number{return database.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(userId,tokenHash).changes as number;}
export function userById(id:string):Row|undefined{return database.prepare('SELECT * FROM users WHERE id=?').get(id) as Row|undefined;}
export function updateUserPassword(id:string,passwordHash:string):void{database.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash,id);}
export function addAuditEvent(input:{householdId:string;userId?:string;action:string;entityKind:string;entityId?:string;label?:string}):void{database.prepare('INSERT INTO audit_events(id,household_id,user_id,action,entity_kind,entity_id,label,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),input.householdId,input.userId??null,input.action,input.entityKind,input.entityId??null,input.label??null,now());}
export function listAuditEvents(householdId:string,entityKind?:string,entityId?:string):Row[]{let sql='SELECT e.*,u.login AS user_login FROM audit_events e LEFT JOIN users u ON u.id=e.user_id WHERE e.household_id=?';const params:(string)[]=[householdId];if(entityKind&&entityId){sql+=' AND e.entity_kind=? AND e.entity_id=?';params.push(entityKind,entityId)}sql+=' ORDER BY e.created_at DESC LIMIT 100';return database.prepare(sql).all(...params) as Row[];}
export function storageUsage(householdId:string): {bytes:number;purchaseValues:{currency:string;amountMinor:number}[]} {
  const storage=database.prepare("SELECT (SELECT COALESCE(SUM(f.byte_size),0) FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE a.household_id=?) + (SELECT COALESCE(SUM(f.byte_size),0) FROM document_files f JOIN documents d ON d.id=f.document_id WHERE d.household_id=?) + (SELECT COALESCE(SUM(byte_size),0) FROM inbox_files WHERE household_id=?) AS bytes").get(householdId,householdId,householdId) as Row;
  const values=database.prepare("SELECT UPPER(COALESCE(NULLIF(TRIM(currency),''),'PLN')) AS currency, COALESCE(SUM(price_minor * CASE WHEN quantity > 0 THEN quantity ELSE 1 END),0) AS amount_minor FROM assets WHERE household_id=? AND deleted_at IS NULL AND archived_at IS NULL AND price_minor IS NOT NULL GROUP BY UPPER(COALESCE(NULLIF(TRIM(currency),''),'PLN')) ORDER BY currency").all(householdId) as Row[];
  return {bytes:Number(storage.bytes),purchaseValues:values.map((row)=>({currency:String(row.currency),amountMinor:Number(row.amount_minor)}))};
}

export function addWebhookDelivery(input:{webhookId:string;event:string;status:number|null;error:string|null}):void{database.prepare('INSERT INTO webhook_deliveries(id,webhook_id,event,status,error,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),input.webhookId,input.event,input.status,input.error,now());}
export function listWebhookDeliveries(userId:string):Row[]{return database.prepare('SELECT d.*,w.name AS webhook_name FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE w.user_id=? ORDER BY d.created_at DESC LIMIT 30').all(userId) as Row[];}

export function listWebhooks(userId:string): Row[] { return database.prepare('SELECT id, name, url, events_json, scope_all, household_ids_json, created_at FROM webhooks WHERE user_id=? ORDER BY created_at DESC').all(userId) as Row[]; }
export function createWebhook(input: { userId:string; name: string; url: string; secretEncrypted: string | null; events: string[]; householdIds?:string[] }): Row { const id=randomUUID(); const createdAt=now(); const ids=[...new Set(input.householdIds??[])]; const all=ids.length===0?1:0; database.prepare('INSERT INTO webhooks(id,user_id,name,url,secret_encrypted,events_json,scope_all,household_ids_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,input.userId,input.name,input.url,input.secretEncrypted,JSON.stringify(input.events),all,JSON.stringify(ids),createdAt); return {id,name:input.name,url:input.url,events:input.events,scopeAll:Boolean(all),householdIds:ids,createdAt}; }
export function updateWebhook(userId:string,id:string,input:{name:string;url:string;secretEncrypted?:string|null|undefined;events:string[];householdIds?:string[]}): boolean { const ids=[...new Set(input.householdIds??[])]; const all=ids.length===0?1:0; const params=[input.name,input.url,JSON.stringify(input.events),all,JSON.stringify(ids)]; if(input.secretEncrypted===undefined)return database.prepare("UPDATE webhooks SET name=?,url=?,events_json=?,scope_all=?,household_ids_json=? WHERE id=? AND user_id=?").run(...params,id,userId).changes>0; return database.prepare("UPDATE webhooks SET name=?,url=?,events_json=?,scope_all=?,household_ids_json=?,secret_encrypted=? WHERE id=? AND user_id=?").run(...params,input.secretEncrypted,id,userId).changes>0; }
export function deleteWebhook(userId:string,id:string): boolean { return database.prepare('DELETE FROM webhooks WHERE id=? AND user_id=?').run(id,userId).changes>0; }
export function webhookTargets(event:string,householdId:string): Row[] { return (database.prepare('SELECT w.* FROM webhooks w JOIN household_members m ON m.user_id=w.user_id AND m.household_id=?').all(householdId) as Row[]).filter(r=>{ try{return (JSON.parse(String(r.events_json)) as string[]).includes(event) && (Number(r.scope_all)===1 || (JSON.parse(String(r.household_ids_json??'[]')) as string[]).includes(householdId))}catch{return false} }); }

export function listStoredFileLocations(): { area: 'items' | 'documents' | 'inbox'; householdId: string; storedName: string }[] {
  const rows = database.prepare(
    "SELECT 'items' AS area, a.household_id, f.stored_name FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE a.household_id IS NOT NULL " +
    "UNION ALL SELECT 'documents' AS area, d.household_id, f.stored_name FROM document_files f JOIN documents d ON d.id=f.document_id WHERE d.household_id IS NOT NULL " +
    "UNION ALL SELECT 'inbox' AS area, household_id, stored_name FROM inbox_files WHERE household_id IS NOT NULL"
  ).all() as Row[];
  return rows.map((row) => ({ area: String(row.area) as 'items' | 'documents' | 'inbox', householdId: String(row.household_id), storedName: String(row.stored_name) }));
}

export function permanentlyDeleteHouseholdTrash(householdId: string): string[] {
  const assetFiles = database.prepare('SELECT f.stored_name FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE a.household_id=? AND a.deleted_at IS NOT NULL').all(householdId) as Row[];
  const documentFiles = database.prepare('SELECT f.stored_name FROM document_files f JOIN documents d ON d.id=f.document_id WHERE d.household_id=? AND d.deleted_at IS NOT NULL').all(householdId) as Row[];
  database.prepare('DELETE FROM assets WHERE household_id=? AND deleted_at IS NOT NULL').run(householdId);
  database.prepare('DELETE FROM documents WHERE household_id=? AND deleted_at IS NOT NULL').run(householdId);
  return [...assetFiles, ...documentFiles].map(row => String(row.stored_name));
}

export function exportBackupData(householdId: string): { tables: Record<string, Row[]>; storedNames: string[] } {
  const tables: Record<string, Row[]> = {};
  tables.assets = database.prepare('SELECT * FROM assets WHERE household_id=?').all(householdId) as Row[];
  tables.documents = database.prepare('SELECT * FROM documents WHERE household_id=?').all(householdId) as Row[];
  const assetIds = tables.assets.map(row => String(row.id)); const documentIds = tables.documents.map(row => String(row.id));
  const inList = (ids:string[]) => ids.length ? `(${ids.map(()=>'?').join(',')})` : '(NULL)';
  tables.warranties = database.prepare(`SELECT * FROM warranties WHERE asset_id IN ${inList(assetIds)}`).all(...assetIds) as Row[];
  tables.maintenance_plans = database.prepare(`SELECT * FROM maintenance_plans WHERE asset_id IN ${inList(assetIds)}`).all(...assetIds) as Row[];
  const planIds=tables.maintenance_plans.map(row=>String(row.id));
  tables.maintenance_records=database.prepare(`SELECT * FROM maintenance_records WHERE plan_id IN ${inList(planIds)}`).all(...planIds) as Row[];
  tables.asset_files=database.prepare(`SELECT * FROM asset_files WHERE asset_id IN ${inList(assetIds)}`).all(...assetIds) as Row[];
  tables.inbox_files=database.prepare('SELECT * FROM inbox_files WHERE household_id=?').all(householdId) as Row[];
  tables.document_files=database.prepare(`SELECT * FROM document_files WHERE document_id IN ${inList(documentIds)}`).all(...documentIds) as Row[];
  tables.document_ocr=database.prepare(`SELECT * FROM document_ocr WHERE document_id IN ${inList(documentIds)}`).all(...documentIds) as Row[];
  const storedNames=['asset_files','inbox_files','document_files'].flatMap(table=>(tables[table]??[]).map(row=>String(row.stored_name)));
  return {tables,storedNames};
}

export function restoreBackupData(householdId: string, tables: Record<string, Row[]>): string[] {
  const order=['assets','warranties','maintenance_plans','maintenance_records','asset_files','inbox_files','documents','document_files','document_ocr'];
  const old=exportBackupData(householdId).storedNames;
  database.exec('BEGIN');
  try {
    database.prepare('DELETE FROM assets_fts WHERE asset_id IN (SELECT id FROM assets WHERE household_id=?)').run(householdId);
    database.prepare('DELETE FROM documents_fts WHERE document_id IN (SELECT id FROM documents WHERE household_id=?)').run(householdId);
    database.prepare('DELETE FROM maintenance_records WHERE plan_id IN (SELECT p.id FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE a.household_id=?)').run(householdId);
    database.prepare('DELETE FROM asset_files WHERE asset_id IN (SELECT id FROM assets WHERE household_id=?)').run(householdId);
    database.prepare('DELETE FROM warranties WHERE asset_id IN (SELECT id FROM assets WHERE household_id=?)').run(householdId);
    database.prepare('DELETE FROM maintenance_plans WHERE asset_id IN (SELECT id FROM assets WHERE household_id=?)').run(householdId);
    database.prepare('DELETE FROM assets WHERE household_id=?').run(householdId);
    database.prepare('DELETE FROM document_files WHERE document_id IN (SELECT id FROM documents WHERE household_id=?)').run(householdId);
    database.prepare('DELETE FROM documents WHERE household_id=?').run(householdId);
    database.prepare('DELETE FROM inbox_files WHERE household_id=?').run(householdId);
    for (const table of order) {
      const rows=tables[table]??[]; if(!Array.isArray(rows)) throw new Error(`Nieprawidłowa tabela backupu: ${table}.`);
      const columns=(database.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map(row=>String(row.name));
      for (const source of rows) {
        const row={...source}; if(table==='assets'||table==='documents'||table==='inbox_files') row.household_id=householdId;
        const used=columns.filter(column=>Object.prototype.hasOwnProperty.call(row,column)); if(!used.length) continue;
        database.prepare(`INSERT INTO ${table}(${used.join(',')}) VALUES (${used.map(()=>'?').join(',')})`).run(...used.map(column=>row[column] as string|number|null|Uint8Array));
      }
    }
    for(const row of tables.assets??[]) syncSearch(String(row.id)); for(const row of tables.documents??[]) syncDocumentSearch(String(row.id));
    database.exec('COMMIT'); return old;
  } catch(error) { database.exec('ROLLBACK'); throw error; }
}

export function seedDatabase(): void {
  const count = database.prepare('SELECT COUNT(*) AS count FROM assets').get() as Row;
  const household = database.prepare('SELECT id FROM households ORDER BY created_at LIMIT 1').get() as Row|undefined;
  if (Number(count.count) > 0 || !household) return;
  const householdId=String(household.id);
  const espresso = createAsset(householdId, { name: 'Ekspres Barista Pro', manufacturer: 'Sage', modelNumber: 'BES878', serialNumber: 'SES878BSS4EEU1', purchaseDate: '2024-09-16', tags: ['Kuchnia', 'AGD'], notes: 'Filtr wody: ClaroSwiss.' });
  saveWarranty(householdId, espresso.id, { kind: 'fixed', scope: 'Gwarancja producenta', expiresOn: '2026-09-16' });
  createMaintenancePlan(householdId, espresso.id, { title: 'Odkamienianie ekspresu', scheduleKind: 'recurring', intervalValue: 3, intervalUnit: 'months', nextDueOn: '2026-10-21' });
  createAsset(householdId, { name: 'Wiertarko-wkrętarka', manufacturer: 'Bosch', modelNumber: 'GSR 18V-55', serialNumber: '88102', purchaseDate: '2025-04-02', tags: ['Warsztat'] });
  createAsset(householdId, { name: 'Słuchawki QuietComfort', manufacturer: 'Bose', modelNumber: 'QC Ultra', purchaseDate: '2024-11-18', tags: ['Elektronika'] });
  createAsset(householdId, { name: 'Router domowy', manufacturer: 'TP-Link', modelNumber: 'AX55', tags: ['Elektronika'] });
}
