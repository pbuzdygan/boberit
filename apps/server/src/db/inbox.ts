import type { AssetFile, AssetFileKind, BinderDocument, CreateBinderDocumentInput, InboxFile } from '@boberit/shared';
import { randomUUID } from 'node:crypto';
import { getAsset } from './assets.js';
import { database } from './database.js';
import { documentFromRow, syncDocumentSearch } from './documents.js';
import { type Row, now, nullable, tags } from './values.js';

function inboxFromRow(row: Row): InboxFile & { storedName: string } {
  return {
    id: String(row.id),
    originalName: String(row.original_name),
    storedName: String(row.stored_name),
    mimeType: String(row.mime_type),
    byteSize: Number(row.byte_size),
    createdAt: String(row.created_at),
  };
}
export function listInboxFiles(householdId: string): InboxFile[] {
  return (
    database
      .prepare('SELECT * FROM inbox_files WHERE household_id=? ORDER BY created_at DESC')
      .all(householdId) as Row[]
  ).map((row) => {
    const { storedName: _storedName, ...file } = inboxFromRow(row);
    return file;
  });
}
export function getInboxFile(householdId: string, id: string): (InboxFile & { storedName: string }) | null {
  const row = database.prepare('SELECT * FROM inbox_files WHERE id = ? AND household_id = ?').get(id, householdId) as
    Row | undefined;
  return row ? inboxFromRow(row) : null;
}
export function addInboxFile(
  householdId: string,
  input: { originalName: string; storedName: string; mimeType: string; byteSize: number },
): InboxFile {
  const id = randomUUID();
  const createdAt = now();
  database
    .prepare(
      'INSERT INTO inbox_files(id, household_id, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, householdId, input.originalName, input.storedName, input.mimeType, input.byteSize, createdAt);
  return { id, originalName: input.originalName, mimeType: input.mimeType, byteSize: input.byteSize, createdAt };
}
export function deleteInboxFile(householdId: string, id: string): string | null {
  const source = getInboxFile(householdId, id);
  if (!source) return null;
  database.prepare('DELETE FROM inbox_files WHERE id = ?').run(id);
  return source.storedName;
}
export function assignInboxFile(
  householdId: string,
  id: string,
  assetId: string,
  kind: AssetFileKind,
): AssetFile | null {
  if (!getAsset(householdId, assetId)) return null;
  const source = getInboxFile(householdId, id);
  if (!source) return null;
  database.exec('BEGIN');
  try {
    database
      .prepare(
        'INSERT INTO asset_files(id, asset_id, kind, kind_locked, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)',
      )
      .run(
        source.id,
        assetId,
        kind,
        source.originalName,
        source.storedName,
        source.mimeType,
        source.byteSize,
        source.createdAt,
      );
    database.prepare('DELETE FROM inbox_files WHERE id = ?').run(id);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return {
    id: source.id,
    assetId,
    kind,
    kindLocked: true,
    originalName: source.originalName,
    mimeType: source.mimeType,
    byteSize: source.byteSize,
    createdAt: source.createdAt,
  };
}

export function assignInboxToDocument(
  householdId: string,
  id: string,
  input: CreateBinderDocumentInput,
): BinderDocument | null {
  const source = getInboxFile(householdId, id);
  if (!source) return null;
  const name = input.name.trim();
  if (!name) throw new Error('Nazwa dokumentu jest wymagana.');
  const documentId = randomUUID();
  const timestamp = now();
  database.exec('BEGIN');
  try {
    database
      .prepare(
        'INSERT INTO documents(id, household_id, name, type, tags_json, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        documentId,
        householdId,
        name,
        nullable(input.type),
        JSON.stringify(tags(input.tags)),
        nullable(input.notes),
        timestamp,
        timestamp,
      );
    database
      .prepare(
        'INSERT INTO document_files(id, document_id, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        source.id,
        documentId,
        source.originalName,
        source.storedName,
        source.mimeType,
        source.byteSize,
        source.createdAt,
      );
    database.prepare('DELETE FROM inbox_files WHERE id = ?').run(id);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  syncDocumentSearch(documentId);
  return documentFromRow(database.prepare('SELECT * FROM documents WHERE id = ?').get(documentId) as Row);
}
