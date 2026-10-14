import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Row } from './values.js';

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
// Search literal fragments anywhere in a word, including Unicode case variants.
// Keep accent folding consistent with the existing FTS5 index.
function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
database.function('search_matches', { deterministic: true }, (text, query) => {
  const normalizedText = normalizeSearch(String(text ?? ''));
  return normalizeSearch(String(query ?? ''))
    .trim()
    .split(/\s+/)
    .every((fragment) => normalizedText.includes(fragment))
    ? 1
    : 0;
});

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
    item_status TEXT NOT NULL DEFAULT 'available',
    category_id TEXT,
    location_id TEXT,
    completeness TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS asset_options (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('category', 'location')),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(household_id, kind, name COLLATE NOCASE)
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
    kind_locked INTEGER NOT NULL DEFAULT 1 CHECK(kind_locked IN (0, 1)),
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
    document_type_id TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS document_types (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(household_id, name COLLATE NOCASE)
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
for (const statement of [
  'ALTER TABLE assets ADD COLUMN deleted_at TEXT',
  'ALTER TABLE documents ADD COLUMN deleted_at TEXT',
  'ALTER TABLE assets ADD COLUMN household_id TEXT',
  'ALTER TABLE documents ADD COLUMN household_id TEXT',
  'ALTER TABLE inbox_files ADD COLUMN household_id TEXT',
  'ALTER TABLE sessions ADD COLUMN active_household_id TEXT',
  'ALTER TABLE webhooks ADD COLUMN user_id TEXT',
  'ALTER TABLE webhooks ADD COLUMN scope_all INTEGER NOT NULL DEFAULT 1',
  "ALTER TABLE webhooks ADD COLUMN household_ids_json TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE assets ADD COLUMN item_status TEXT NOT NULL DEFAULT 'available'",
  'ALTER TABLE assets ADD COLUMN category_id TEXT',
  'ALTER TABLE assets ADD COLUMN location_id TEXT',
  'ALTER TABLE asset_files ADD COLUMN kind_locked INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE documents ADD COLUMN document_type_id TEXT',
]) {
  try {
    database.exec(statement);
  } catch {
    /* Column already exists. */
  }
}
database.exec(
  "UPDATE document_ocr SET status='pending', error=NULL WHERE status='processing'; UPDATE assets SET household_id=(SELECT id FROM households ORDER BY created_at LIMIT 1) WHERE household_id IS NULL AND EXISTS(SELECT 1 FROM households); UPDATE documents SET household_id=(SELECT id FROM households ORDER BY created_at LIMIT 1) WHERE household_id IS NULL AND EXISTS(SELECT 1 FROM households); UPDATE inbox_files SET household_id=(SELECT id FROM households ORDER BY created_at LIMIT 1) WHERE household_id IS NULL AND EXISTS(SELECT 1 FROM households); UPDATE sessions SET active_household_id=(SELECT m.household_id FROM household_members m WHERE m.user_id=sessions.user_id ORDER BY m.created_at LIMIT 1) WHERE active_household_id IS NULL; UPDATE webhooks SET user_id=(SELECT id FROM users ORDER BY created_at LIMIT 1) WHERE user_id IS NULL AND EXISTS(SELECT 1 FROM users);",
);
for (const row of database
  .prepare(
    "SELECT DISTINCT household_id,type FROM documents WHERE household_id IS NOT NULL AND type IS NOT NULL AND TRIM(type)<>'' AND document_type_id IS NULL",
  )
  .all() as Row[]) {
  let option = database
    .prepare('SELECT id FROM document_types WHERE household_id=? AND name=? COLLATE NOCASE')
    .get(String(row.household_id), String(row.type)) as Row | undefined;
  if (!option) {
    const id = randomUUID();
    database
      .prepare('INSERT INTO document_types(id,household_id,name,created_at) VALUES(?,?,?,?)')
      .run(id, String(row.household_id), String(row.type).trim(), new Date().toISOString());
    option = { id };
  }
  database
    .prepare('UPDATE documents SET document_type_id=? WHERE household_id=? AND type=? AND document_type_id IS NULL')
    .run(String(option.id), String(row.household_id), String(row.type));
}
