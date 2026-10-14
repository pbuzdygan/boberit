import { syncSearch } from './assets.js';
import { database } from './database.js';
import { syncDocumentSearch } from './documents.js';
import type { Row } from './values.js';

export function listStoredFileLocations(): {
  area: 'items' | 'documents' | 'inbox';
  householdId: string;
  storedName: string;
}[] {
  const rows = database
    .prepare(
      "SELECT 'items' AS area, a.household_id, f.stored_name FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE a.household_id IS NOT NULL " +
        "UNION ALL SELECT 'documents' AS area, d.household_id, f.stored_name FROM document_files f JOIN documents d ON d.id=f.document_id WHERE d.household_id IS NOT NULL " +
        "UNION ALL SELECT 'inbox' AS area, household_id, stored_name FROM inbox_files WHERE household_id IS NOT NULL",
    )
    .all() as Row[];
  return rows.map((row) => ({
    area: String(row.area) as 'items' | 'documents' | 'inbox',
    householdId: String(row.household_id),
    storedName: String(row.stored_name),
  }));
}

export function exportBackupData(householdId: string): {
  tables: Record<string, Row[]>;
  files: { area: 'items' | 'inbox' | 'documents'; storedName: string }[];
} {
  const tables: Record<string, Row[]> = {};
  tables.asset_options = database.prepare('SELECT * FROM asset_options WHERE household_id=?').all(householdId) as Row[];
  tables.document_types = database
    .prepare('SELECT * FROM document_types WHERE household_id=?')
    .all(householdId) as Row[];
  tables.assets = database.prepare('SELECT * FROM assets WHERE household_id=?').all(householdId) as Row[];
  tables.documents = database.prepare('SELECT * FROM documents WHERE household_id=?').all(householdId) as Row[];
  const assetIds = tables.assets.map((row) => String(row.id));
  const documentIds = tables.documents.map((row) => String(row.id));
  const inList = (ids: string[]) => (ids.length ? `(${ids.map(() => '?').join(',')})` : '(NULL)');
  tables.warranties = database
    .prepare(`SELECT * FROM warranties WHERE asset_id IN ${inList(assetIds)}`)
    .all(...assetIds) as Row[];
  tables.maintenance_plans = database
    .prepare(`SELECT * FROM maintenance_plans WHERE asset_id IN ${inList(assetIds)}`)
    .all(...assetIds) as Row[];
  const planIds = tables.maintenance_plans.map((row) => String(row.id));
  tables.maintenance_records = database
    .prepare(`SELECT * FROM maintenance_records WHERE plan_id IN ${inList(planIds)}`)
    .all(...planIds) as Row[];
  tables.asset_files = database
    .prepare(`SELECT * FROM asset_files WHERE asset_id IN ${inList(assetIds)}`)
    .all(...assetIds) as Row[];
  tables.inbox_files = database.prepare('SELECT * FROM inbox_files WHERE household_id=?').all(householdId) as Row[];
  tables.document_files = database
    .prepare(`SELECT * FROM document_files WHERE document_id IN ${inList(documentIds)}`)
    .all(...documentIds) as Row[];
  tables.document_ocr = database
    .prepare(`SELECT * FROM document_ocr WHERE document_id IN ${inList(documentIds)}`)
    .all(...documentIds) as Row[];
  const areas = { asset_files: 'items', inbox_files: 'inbox', document_files: 'documents' } as const;
  const files = (Object.keys(areas) as (keyof typeof areas)[]).flatMap((table) =>
    (tables[table] ?? []).map((row) => ({ area: areas[table], storedName: String(row.stored_name) })),
  );
  return { tables, files };
}

// Rows must come from prepareRestore (backup.ts), which validates them and assigns fresh identifiers.
export function restoreBackupData(
  householdId: string,
  tables: Record<string, Record<string, string | number | null>[]>,
): { area: 'items' | 'inbox' | 'documents'; storedName: string }[] {
  const order = [
    'asset_options',
    'document_types',
    'assets',
    'warranties',
    'maintenance_plans',
    'maintenance_records',
    'asset_files',
    'inbox_files',
    'documents',
    'document_files',
    'document_ocr',
  ];
  const old = exportBackupData(householdId).files;
  database.exec('BEGIN');
  try {
    database
      .prepare('DELETE FROM assets_fts WHERE asset_id IN (SELECT id FROM assets WHERE household_id=?)')
      .run(householdId);
    database
      .prepare('DELETE FROM documents_fts WHERE document_id IN (SELECT id FROM documents WHERE household_id=?)')
      .run(householdId);
    database
      .prepare(
        'DELETE FROM maintenance_records WHERE plan_id IN (SELECT p.id FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id WHERE a.household_id=?)',
      )
      .run(householdId);
    database
      .prepare('DELETE FROM asset_files WHERE asset_id IN (SELECT id FROM assets WHERE household_id=?)')
      .run(householdId);
    database
      .prepare('DELETE FROM warranties WHERE asset_id IN (SELECT id FROM assets WHERE household_id=?)')
      .run(householdId);
    database
      .prepare('DELETE FROM maintenance_plans WHERE asset_id IN (SELECT id FROM assets WHERE household_id=?)')
      .run(householdId);
    database.prepare('DELETE FROM assets WHERE household_id=?').run(householdId);
    database.prepare('DELETE FROM asset_options WHERE household_id=?').run(householdId);
    database
      .prepare('DELETE FROM document_files WHERE document_id IN (SELECT id FROM documents WHERE household_id=?)')
      .run(householdId);
    database.prepare('DELETE FROM documents WHERE household_id=?').run(householdId);
    database.prepare('DELETE FROM document_types WHERE household_id=?').run(householdId);
    database.prepare('DELETE FROM inbox_files WHERE household_id=?').run(householdId);
    for (const table of order) {
      const rows = tables[table] ?? [];
      const columns = (database.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((row) => String(row.name));
      for (const source of rows) {
        const row = { ...source };
        if (
          table === 'asset_options' ||
          table === 'document_types' ||
          table === 'assets' ||
          table === 'documents' ||
          table === 'inbox_files'
        )
          row.household_id = householdId;
        const used = columns.filter((column) => Object.prototype.hasOwnProperty.call(row, column));
        if (!used.length) continue;
        database
          .prepare(`INSERT INTO ${table}(${used.join(',')}) VALUES (${used.map(() => '?').join(',')})`)
          .run(...used.map((column) => row[column] as string | number | null));
      }
    }
    for (const row of tables.assets ?? []) syncSearch(String(row.id));
    for (const row of tables.documents ?? []) syncDocumentSearch(String(row.id));
    database.exec('COMMIT');
    return old;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
