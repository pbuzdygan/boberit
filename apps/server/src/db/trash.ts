import type { TrashEntry, TrashKind } from '@boberit/shared';
import { syncSearch } from './assets.js';
import { database } from './database.js';
import { syncDocumentSearch } from './documents.js';
import { type Row, now, nullable } from './values.js';

export function moveAssetToTrash(householdId: string, id: string): boolean {
  const result = database
    .prepare('UPDATE assets SET deleted_at=?, updated_at=? WHERE id=? AND household_id=? AND deleted_at IS NULL')
    .run(now(), now(), id, householdId);
  return result.changes > 0;
}
export function moveDocumentToTrash(householdId: string, id: string): boolean {
  const result = database
    .prepare('UPDATE documents SET deleted_at=?, updated_at=? WHERE id=? AND household_id=? AND deleted_at IS NULL')
    .run(now(), now(), id, householdId);
  return result.changes > 0;
}
export function restoreTrashEntry(householdId: string, kind: TrashKind, id: string): boolean {
  const table = kind === 'asset' ? 'assets' : 'documents';
  const result = database
    .prepare(
      `UPDATE ${table} SET deleted_at=NULL, updated_at=? WHERE id=? AND household_id=? AND deleted_at IS NOT NULL`,
    )
    .run(now(), id, householdId);
  if (result.changes && kind === 'asset') syncSearch(id);
  if (result.changes && kind === 'document') syncDocumentSearch(id);
  return result.changes > 0;
}
export function listTrash(householdId: string, kind?: TrashKind): TrashEntry[] {
  const entries: TrashEntry[] = [];
  if (!kind || kind === 'asset')
    entries.push(
      ...(
        database
          .prepare(
            'SELECT id, name, manufacturer, model_number, deleted_at FROM assets WHERE household_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
          )
          .all(householdId) as Row[]
      ).map((row) => ({
        id: String(row.id),
        kind: 'asset' as const,
        name: String(row.name),
        detail: [nullable(row.manufacturer), nullable(row.model_number)].filter(Boolean).join(' · ') || null,
        deletedAt: String(row.deleted_at),
      })),
    );
  if (!kind || kind === 'document')
    entries.push(
      ...(
        database
          .prepare(
            'SELECT id, name, type, deleted_at FROM documents WHERE household_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
          )
          .all(householdId) as Row[]
      ).map((row) => ({
        id: String(row.id),
        kind: 'document' as const,
        name: String(row.name),
        detail: nullable(row.type),
        deletedAt: String(row.deleted_at),
      })),
    );
  return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
function storedNamesForDeleted(before?: string): { householdId: string; storedName: string }[] {
  const condition = before ? 'deleted_at IS NOT NULL AND deleted_at <= ?' : 'deleted_at IS NOT NULL';
  const parameter = before ? [before] : [];
  const assetRows = database
    .prepare(
      `SELECT a.household_id, f.stored_name FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE a.${condition}`,
    )
    .all(...parameter) as Row[];
  const documentRows = database
    .prepare(
      `SELECT d.household_id, f.stored_name FROM document_files f JOIN documents d ON d.id=f.document_id WHERE d.${condition}`,
    )
    .all(...parameter) as Row[];
  return [...assetRows, ...documentRows].map((row) => ({
    householdId: String(row.household_id),
    storedName: String(row.stored_name),
  }));
}
export function permanentlyDeleteTrash(before?: string): { householdId: string; storedName: string }[] {
  const names = storedNamesForDeleted(before);
  const condition = before ? 'deleted_at IS NOT NULL AND deleted_at <= ?' : 'deleted_at IS NOT NULL';
  const parameter = before ? [before] : [];
  database.prepare(`DELETE FROM assets WHERE ${condition}`).run(...parameter);
  database.prepare(`DELETE FROM documents WHERE ${condition}`).run(...parameter);
  return names;
}

export function permanentlyDeleteHouseholdTrash(householdId: string): string[] {
  const assetFiles = database
    .prepare(
      'SELECT f.stored_name FROM asset_files f JOIN assets a ON a.id=f.asset_id WHERE a.household_id=? AND a.deleted_at IS NOT NULL',
    )
    .all(householdId) as Row[];
  const documentFiles = database
    .prepare(
      'SELECT f.stored_name FROM document_files f JOIN documents d ON d.id=f.document_id WHERE d.household_id=? AND d.deleted_at IS NOT NULL',
    )
    .all(householdId) as Row[];
  database.prepare('DELETE FROM assets WHERE household_id=? AND deleted_at IS NOT NULL').run(householdId);
  database.prepare('DELETE FROM documents WHERE household_id=? AND deleted_at IS NOT NULL').run(householdId);
  return [...assetFiles, ...documentFiles].map((row) => String(row.stored_name));
}
