import type { BinderDocument, CreateBinderDocumentInput, DocumentFile } from '@boberit/shared';
import { randomUUID } from 'node:crypto';
import { database } from './database.js';
import { type Row, now, nullable, tags, parseTags } from './values.js';

function documentFilesFor(documentId: string): DocumentFile[] {
  return (
    database
      .prepare('SELECT * FROM document_files WHERE document_id = ? ORDER BY created_at DESC')
      .all(documentId) as Row[]
  ).map((row) => ({
    id: String(row.id),
    documentId: String(row.document_id),
    originalName: String(row.original_name),
    mimeType: String(row.mime_type),
    byteSize: Number(row.byte_size),
    createdAt: String(row.created_at),
  }));
}
export function documentFromRow(row: Row): BinderDocument {
  const id = String(row.id);
  const documentType = row.document_type_id
    ? (database.prepare('SELECT name FROM document_types WHERE id=?').get(String(row.document_type_id)) as
        Row | undefined)
    : undefined;
  const ocr = database.prepare('SELECT status,text FROM document_ocr WHERE document_id=?').get(id) as Row | undefined;
  return {
    id,
    name: String(row.name),
    type: documentType ? String(documentType.name) : nullable(row.type),
    typeId: documentType ? String(row.document_type_id) : null,
    tags: parseTags(row.tags_json),
    notes: nullable(row.notes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    files: documentFilesFor(id),
    ocrStatus: ocr ? String(ocr.status) : null,
    ocrTextPreview: ocr?.text ? String(ocr.text).slice(0, 180) : null,
  } as BinderDocument;
}
export function syncDocumentSearch(documentId: string): void {
  const row = database
    .prepare(
      'SELECT d.name, d.type, d.tags_json, d.notes, o.text AS ocr_text FROM documents d LEFT JOIN document_ocr o ON o.document_id=d.id WHERE d.id = ?',
    )
    .get(documentId) as Row | undefined;
  if (!row) return;
  const text = [row.name, row.type, row.notes, row.ocr_text, ...parseTags(row.tags_json)].filter(Boolean).join(' ');
  database.prepare('DELETE FROM documents_fts WHERE document_id = ?').run(documentId);
  database.prepare('INSERT INTO documents_fts(document_id, search_text) VALUES (?, ?)').run(documentId, text);
}
export function documentFilesForOcr(householdId: string, documentId: string): Row[] {
  return database
    .prepare(
      'SELECT f.id,f.original_name,f.stored_name,f.mime_type FROM document_files f JOIN documents d ON d.id=f.document_id WHERE f.document_id=? AND d.household_id=? AND d.deleted_at IS NULL ORDER BY f.created_at',
    )
    .all(documentId, householdId) as Row[];
}
export function documentExists(householdId: string, documentId: string): boolean {
  return (
    database
      .prepare('SELECT 1 FROM documents WHERE id=? AND household_id=? AND deleted_at IS NULL')
      .get(documentId, householdId) !== undefined
  );
}
export function setDocumentOcr(
  householdId: string,
  documentId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported',
  text = '',
  error: string | null = null,
): boolean {
  const found = database
    .prepare('SELECT id FROM documents WHERE id=? AND household_id=? AND deleted_at IS NULL')
    .get(documentId, householdId) as Row | undefined;
  if (!found) return false;
  database
    .prepare(
      'INSERT INTO document_ocr(document_id,status,text,error,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET status=excluded.status,text=excluded.text,error=excluded.error,updated_at=excluded.updated_at',
    )
    .run(documentId, status, text, error, now());
  syncDocumentSearch(documentId);
  return true;
}
export function getDocumentOcr(householdId: string, documentId: string): Row | null {
  const row = database
    .prepare(
      'SELECT o.status,o.text,o.error,o.updated_at FROM document_ocr o JOIN documents d ON d.id=o.document_id WHERE o.document_id=? AND d.household_id=? AND d.deleted_at IS NULL',
    )
    .get(documentId, householdId) as Row | undefined;
  return row ?? null;
}
export function saveDocumentOcrText(householdId: string, documentId: string, text: string): boolean {
  return setDocumentOcr(householdId, documentId, 'completed', text.slice(0, 2_000_000), null);
}
export function documentsNeedingOcr(householdId: string, limit = 1000): Row[] {
  return database
    .prepare(
      "SELECT d.id FROM documents d WHERE d.household_id=? AND d.deleted_at IS NULL AND EXISTS(SELECT 1 FROM document_files f WHERE f.document_id=d.id) AND (NOT EXISTS(SELECT 1 FROM document_ocr o WHERE o.document_id=d.id) OR EXISTS(SELECT 1 FROM document_ocr o WHERE o.document_id=d.id AND o.status IN ('pending','failed'))) ORDER BY d.updated_at DESC LIMIT ?",
    )
    .all(householdId, limit) as Row[];
}
export function listDocuments(householdId: string, query = ''): BinderDocument[] {
  const rows = query.trim()
    ? (database
        .prepare(
          'SELECT d.* FROM documents_fts s JOIN documents d ON d.id = s.document_id WHERE d.household_id = ? AND d.deleted_at IS NULL AND search_matches(s.search_text, ?) ORDER BY d.updated_at DESC',
        )
        .all(householdId, query) as Row[])
    : (database
        .prepare('SELECT * FROM documents WHERE household_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC')
        .all(householdId) as Row[]);
  return rows.map(documentFromRow);
}
function documentTypeValue(householdId: string, idValue: unknown): { id: string; name: string } | null {
  const id = nullable(idValue);
  if (!id) return null;
  const row = database
    .prepare('SELECT id,name FROM document_types WHERE id=? AND household_id=?')
    .get(id, householdId) as Row | undefined;
  if (!row) throw new Error('Wybrany typ dokumentu nie istnieje.');
  return { id: String(row.id), name: String(row.name) };
}
export function createDocument(householdId: string, input: CreateBinderDocumentInput): BinderDocument {
  const name = input.name.trim();
  if (!name) throw new Error('Nazwa dokumentu jest wymagana.');
  const id = randomUUID();
  const timestamp = now();
  const documentType = input.typeId === undefined ? null : documentTypeValue(householdId, input.typeId);
  database
    .prepare(
      'INSERT INTO documents(id, household_id, name, type, document_type_id, tags_json, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      id,
      householdId,
      name,
      documentType?.name ?? nullable(input.type),
      documentType?.id ?? null,
      JSON.stringify(tags(input.tags)),
      nullable(input.notes),
      timestamp,
      timestamp,
    );
  syncDocumentSearch(id);
  return documentFromRow(database.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Row);
}
export function updateDocument(
  householdId: string,
  id: string,
  input: Partial<CreateBinderDocumentInput>,
): BinderDocument | null {
  const current = database.prepare('SELECT * FROM documents WHERE id = ? AND household_id = ?').get(id, householdId) as
    Row | undefined;
  if (!current) return null;
  const name = input.name === undefined ? String(current.name) : input.name.trim();
  if (!name) throw new Error('Nazwa dokumentu jest wymagana.');
  const selectedType = input.typeId === undefined ? undefined : documentTypeValue(householdId, input.typeId);
  const type =
    selectedType === undefined
      ? input.type === undefined
        ? nullable(current.type)
        : nullable(input.type)
      : (selectedType?.name ?? null);
  const typeId =
    selectedType === undefined
      ? input.type === undefined
        ? nullable(current.document_type_id)
        : null
      : (selectedType?.id ?? null);
  const nextTags = input.tags === undefined ? parseTags(current.tags_json) : tags(input.tags);
  const notes = input.notes === undefined ? nullable(current.notes) : nullable(input.notes);
  database
    .prepare('UPDATE documents SET name=?, type=?, document_type_id=?, tags_json=?, notes=?, updated_at=? WHERE id=?')
    .run(name, type, typeId, JSON.stringify(nextTags), notes, now(), id);
  syncDocumentSearch(id);
  return documentFromRow(database.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Row);
}
export function addDocumentFile(
  householdId: string,
  documentId: string,
  input: { originalName: string; storedName: string; mimeType: string; byteSize: number },
): DocumentFile | null {
  const exists = database
    .prepare('SELECT id FROM documents WHERE id = ? AND household_id = ?')
    .get(documentId, householdId) as Row | undefined;
  if (!exists) return null;
  const id = randomUUID();
  const createdAt = now();
  database
    .prepare(
      'INSERT INTO document_files(id, document_id, original_name, stored_name, mime_type, byte_size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, documentId, input.originalName, input.storedName, input.mimeType, input.byteSize, createdAt);
  database.prepare('UPDATE documents SET updated_at=? WHERE id=?').run(now(), documentId);
  return {
    id,
    documentId,
    originalName: input.originalName,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    createdAt,
  };
}

export function getDocumentFile(householdId: string, id: string): (DocumentFile & { storedName: string }) | null {
  const row = database
    .prepare(
      'SELECT f.* FROM document_files f JOIN documents d ON d.id=f.document_id WHERE f.id = ? AND d.household_id = ? AND d.deleted_at IS NULL',
    )
    .get(id, householdId) as Row | undefined;
  return row
    ? {
        id: String(row.id),
        documentId: String(row.document_id),
        originalName: String(row.original_name),
        storedName: String(row.stored_name),
        mimeType: String(row.mime_type),
        byteSize: Number(row.byte_size),
        createdAt: String(row.created_at),
      }
    : null;
}

export function deleteDocumentFile(
  householdId: string,
  documentId: string,
  fileId: string,
): { storedName: string; remainingFiles: number } | null {
  const source = database
    .prepare(
      'SELECT f.stored_name FROM document_files f JOIN documents d ON d.id=f.document_id WHERE f.id=? AND f.document_id=? AND d.household_id=? AND d.deleted_at IS NULL',
    )
    .get(fileId, documentId, householdId) as Row | undefined;
  if (!source) return null;
  database.prepare('DELETE FROM document_files WHERE id=?').run(fileId);
  database.prepare('UPDATE documents SET updated_at=? WHERE id=?').run(now(), documentId);
  const remaining = database
    .prepare('SELECT COUNT(*) AS count FROM document_files WHERE document_id=?')
    .get(documentId) as Row;
  return { storedName: String(source.stored_name), remainingFiles: Number(remaining.count) };
}
