import type { CreateBinderDocumentInput } from '@boberit/shared';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { addAuditEvent } from '../db/audit.js';
import {
  documentExists,
  addDocumentFile,
  deleteDocumentFile,
  setDocumentOcr,
  getDocumentOcr,
  saveDocumentOcrText,
  documentsNeedingOcr,
  createDocument,
  listDocuments,
  updateDocument,
} from '../db/documents.js';
import { moveDocumentToTrash } from '../db/trash.js';
import { runDocumentOcr } from '../document-ocr.js';
import { failure, json, PublicError } from '../http.js';
import { notify } from '../notify.js';
import { currentUser, householdId } from '../session.js';
import { removeStoredFiles, writeStoredFile } from '../storage.js';
import { prepareUpload, validateUpload } from '../uploads.js';

export const documentsRoutes = new Hono();
documentsRoutes.get('/api/v1/documents', (c) =>
  c.json({ data: listDocuments(householdId(c.req.raw), c.req.query('q') ?? '') }),
);
documentsRoutes.post('/api/v1/documents', async (c) => {
  const document = createDocument(householdId(c.req.raw), await json<CreateBinderDocumentInput>(c.req.raw));
  addAuditEvent({
    householdId: householdId(c.req.raw),
    userId: String(currentUser(c.req.raw)!.id),
    action: 'created',
    entityKind: 'document',
    entityId: document.id,
    label: document.name,
  });
  notify('document.created', { id: document.id, name: document.name }, householdId(c.req.raw));
  return c.json({ data: document }, 201);
});
documentsRoutes.get('/api/v1/documents/:id/ocr', (c) => {
  const data = getDocumentOcr(householdId(c.req.raw), c.req.param('id'));
  return data ? c.json({ data }) : c.json(failure('OCR nie został jeszcze uruchomiony.', 404, 'NOT_FOUND'), 404);
});
documentsRoutes.put('/api/v1/documents/:id/ocr', async (c) => {
  const input = await json<{ text: string }>(c.req.raw);
  return saveDocumentOcrText(householdId(c.req.raw), c.req.param('id'), String(input.text ?? ''))
    ? c.json({ data: { saved: true } })
    : c.json(failure('Nie znaleziono dokumentu.', 404, 'NOT_FOUND'), 404);
});
documentsRoutes.post('/api/v1/documents/ocr/batch', async (c) => {
  const scope = householdId(c.req.raw);
  const docs = documentsNeedingOcr(scope);
  for (const doc of docs) await runDocumentOcr(scope, String(doc.id));
  return c.json({ data: { processed: docs.length } });
});
documentsRoutes.post('/api/v1/documents/:id/ocr', async (c) => {
  const scope = householdId(c.req.raw);
  if (!documentExists(scope, c.req.param('id')))
    return c.json(failure('Nie znaleziono dokumentu.', 404, 'NOT_FOUND'), 404);
  await runDocumentOcr(scope, c.req.param('id'));
  return c.json({ data: { processed: true } });
});
documentsRoutes.patch('/api/v1/documents/:id', async (c) => {
  const document = updateDocument(
    householdId(c.req.raw),
    c.req.param('id'),
    await json<Partial<CreateBinderDocumentInput>>(c.req.raw),
  );
  return document ? c.json({ data: document }) : c.json(failure('Nie znaleziono dokumentu.', 404, 'NOT_FOUND'), 404);
});
documentsRoutes.delete('/api/v1/documents/:id', (c) => {
  const scope = householdId(c.req.raw);
  const document = listDocuments(scope).find((entry) => entry.id === c.req.param('id'));
  if (!moveDocumentToTrash(scope, c.req.param('id')))
    return c.json(failure('Nie znaleziono dokumentu.', 404, 'NOT_FOUND'), 404);
  addAuditEvent({
    householdId: scope,
    userId: String(currentUser(c.req.raw)!.id),
    action: 'trashed',
    entityKind: 'document',
    entityId: c.req.param('id'),
    label: document?.name ?? '',
  });
  notify('document.deleted', { id: c.req.param('id'), name: document?.name }, scope);
  return c.body(null, 204);
});
documentsRoutes.post('/api/v1/documents/:id/files', async (c) => {
  // Check ownership before writing anything, so a rejected upload never leaves an orphaned file on disk.
  if (!documentExists(householdId(c.req.raw), c.req.param('id')))
    return c.json(failure('Nie znaleziono dokumentu.', 404, 'NOT_FOUND'), 404);
  const form = await c.req.raw.formData();
  const rawFile = form.get('file');
  if (!rawFile || typeof rawFile === 'string') throw new PublicError('Wybierz plik do dodania.');
  validateUpload(rawFile);
  const upload = await prepareUpload(rawFile);
  const storedName = `${randomUUID()}${upload.extension}`;
  const scope = householdId(c.req.raw);
  writeStoredFile('documents', scope, storedName, upload.data);
  const file = addDocumentFile(scope, c.req.param('id'), {
    originalName: upload.originalName,
    storedName,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
  });
  if (file) {
    setDocumentOcr(scope, c.req.param('id'), 'pending');
    return c.json({ data: file }, 201);
  }
  return c.json(failure('Nie znaleziono dokumentu.', 404, 'NOT_FOUND'), 404);
});
documentsRoutes.delete('/api/v1/documents/:id/files/:fileId', async (c) => {
  const scope = householdId(c.req.raw);
  const documentId = c.req.param('id');
  const removed = deleteDocumentFile(scope, documentId, c.req.param('fileId'));
  if (!removed) return c.json(failure('Nie znaleziono załącznika dokumentu.', 404, 'NOT_FOUND'), 404);
  setDocumentOcr(scope, documentId, 'pending');
  removeStoredFiles([{ householdId: scope, storedName: removed.storedName }]);
  if (removed.remainingFiles > 0) await runDocumentOcr(scope, documentId);
  else setDocumentOcr(scope, documentId, 'unsupported', '', 'Dokument nie ma załączników.');
  return c.body(null, 204);
});
