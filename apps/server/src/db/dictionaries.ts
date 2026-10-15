import type { AssetOption, AssetOptionKind, DocumentType } from '@boberit/shared';
import { randomUUID } from 'node:crypto';
import { syncSearch } from './assets.js';
import { database } from './database.js';
import { syncDocumentSearch } from './documents.js';
import { type Row, now } from './values.js';
import { PublicError } from '../http.js';

export function listDocumentTypes(householdId: string): DocumentType[] {
  return (
    database
      .prepare('SELECT id,name FROM document_types WHERE household_id=? ORDER BY name COLLATE NOCASE')
      .all(householdId) as Row[]
  ).map((row) => ({ id: String(row.id), name: String(row.name) }));
}
export function createDocumentType(householdId: string, nameValue: string): DocumentType {
  const name = nameValue.trim();
  if (!name || name.length > 80) throw new PublicError('Nazwa musi mieć od 1 do 80 znaków.');
  const id = randomUUID();
  database
    .prepare('INSERT INTO document_types(id,household_id,name,created_at) VALUES(?,?,?,?)')
    .run(id, householdId, name, now());
  return { id, name };
}
export function updateDocumentType(householdId: string, id: string, nameValue: string): DocumentType | null {
  const name = nameValue.trim();
  if (!name || name.length > 80) throw new PublicError('Nazwa musi mieć od 1 do 80 znaków.');
  const result = database
    .prepare('UPDATE document_types SET name=? WHERE id=? AND household_id=?')
    .run(name, id, householdId);
  if (!result.changes) return null;
  database
    .prepare('UPDATE documents SET type=?,updated_at=? WHERE household_id=? AND document_type_id=?')
    .run(name, now(), householdId, id);
  for (const row of database
    .prepare('SELECT id FROM documents WHERE household_id=? AND document_type_id=?')
    .all(householdId, id) as Row[])
    syncDocumentSearch(String(row.id));
  return { id, name };
}
export function deleteDocumentType(householdId: string, id: string): boolean {
  const affected = (
    database
      .prepare('SELECT id FROM documents WHERE household_id=? AND document_type_id=?')
      .all(householdId, id) as Row[]
  ).map((row) => String(row.id));
  database.exec('BEGIN');
  try {
    database
      .prepare(
        'UPDATE documents SET type=NULL,document_type_id=NULL,updated_at=? WHERE household_id=? AND document_type_id=?',
      )
      .run(now(), householdId, id);
    const result = database.prepare('DELETE FROM document_types WHERE id=? AND household_id=?').run(id, householdId);
    database.exec('COMMIT');
    for (const documentId of affected) syncDocumentSearch(documentId);
    return result.changes > 0;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
export function listAssetOptions(householdId: string): AssetOption[] {
  return (
    database
      .prepare('SELECT id,kind,name FROM asset_options WHERE household_id=? ORDER BY kind,name COLLATE NOCASE')
      .all(householdId) as Row[]
  ).map((row) => ({ id: String(row.id), kind: row.kind as AssetOptionKind, name: String(row.name) }));
}
export function createAssetOption(householdId: string, kind: AssetOptionKind, nameValue: string): AssetOption {
  const name = nameValue.trim();
  if (!name || name.length > 80) throw new PublicError('Nazwa musi mieć od 1 do 80 znaków.');
  const id = randomUUID();
  database
    .prepare('INSERT INTO asset_options(id,household_id,kind,name,created_at) VALUES(?,?,?,?,?)')
    .run(id, householdId, kind, name, now());
  return { id, kind, name };
}
export function updateAssetOption(householdId: string, id: string, nameValue: string): AssetOption | null {
  const name = nameValue.trim();
  if (!name || name.length > 80) throw new PublicError('Nazwa musi mieć od 1 do 80 znaków.');
  const result = database
    .prepare('UPDATE asset_options SET name=? WHERE id=? AND household_id=?')
    .run(name, id, householdId);
  if (!result.changes) return null;
  const row = database.prepare('SELECT kind FROM asset_options WHERE id=?').get(id) as Row;
  for (const asset of database
    .prepare('SELECT id FROM assets WHERE household_id=? AND (category_id=? OR location_id=?)')
    .all(householdId, id, id) as Row[])
    syncSearch(String(asset.id));
  return { id, kind: row.kind as AssetOptionKind, name };
}
export function deleteAssetOption(householdId: string, id: string): boolean {
  const affected = (
    database
      .prepare('SELECT id FROM assets WHERE household_id=? AND (category_id=? OR location_id=?)')
      .all(householdId, id, id) as Row[]
  ).map((row) => String(row.id));
  database.exec('BEGIN');
  try {
    database.prepare('UPDATE assets SET category_id=NULL WHERE household_id=? AND category_id=?').run(householdId, id);
    database.prepare('UPDATE assets SET location_id=NULL WHERE household_id=? AND location_id=?').run(householdId, id);
    const result = database.prepare('DELETE FROM asset_options WHERE id=? AND household_id=?').run(id, householdId);
    database.exec('COMMIT');
    for (const assetId of affected) syncSearch(assetId);
    return result.changes > 0;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
