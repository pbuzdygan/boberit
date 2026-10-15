import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import {
  addInboxFile,
  assignInboxFile,
  assignInboxToDocument,
  deleteInboxFile,
  getInboxFile,
  listInboxFiles,
} from '../db/inbox.js';
import { runDocumentOcr } from '../document-ocr.js';
import { failure, PublicError } from '../http.js';
import { assetFileKinds, documentCreateInput, inboxAssignInput } from '../inputs.js';
import { readBody } from '../validate.js';
import { householdId } from '../session.js';
import { relocateStoredFile, removeStoredFiles, writeStoredFile } from '../storage.js';
import { prepareUpload, validateUpload } from '../uploads.js';

export const inboxRoutes = new Hono();
inboxRoutes.get('/api/v1/inbox', (c) => c.json({ data: listInboxFiles(householdId(c.req.raw)) }));
inboxRoutes.post('/api/v1/inbox/files', async (c) => {
  const form = await c.req.raw.formData();
  const rawFile = form.get('file');
  if (!rawFile || typeof rawFile === 'string') throw new PublicError('Wybierz plik do dodania.');
  validateUpload(rawFile);
  const upload = await prepareUpload(rawFile);
  const storedName = `${randomUUID()}${upload.extension}`;
  const scope = householdId(c.req.raw);
  writeStoredFile('inbox', scope, storedName, upload.data);
  const file = addInboxFile(scope, {
    originalName: upload.originalName,
    storedName,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
  });
  return c.json({ data: file }, 201);
});
inboxRoutes.delete('/api/v1/inbox/:id', (c) => {
  const scope = householdId(c.req.raw);
  const storedName = deleteInboxFile(scope, c.req.param('id'));
  if (!storedName) return c.json(failure('Nie znaleziono pliku na liście Do przypisania.', 404, 'NOT_FOUND'), 404);
  removeStoredFiles([{ householdId: scope, storedName }]);
  return c.body(null, 204);
});
inboxRoutes.post('/api/v1/inbox/:id/assign', async (c) => {
  const input = await readBody(c.req.raw, inboxAssignInput);
  const kind = assetFileKinds.find((entry) => entry === input.kind) ?? 'other';
  const scope = householdId(c.req.raw);
  const source = getInboxFile(scope, c.req.param('id'));
  const file = assignInboxFile(scope, c.req.param('id'), input.assetId, kind);
  if (file && source) relocateStoredFile('items', scope, source.storedName);
  return file ? c.json({ data: file }) : c.json(failure('Nie znaleziono pliku lub przedmiotu.', 404, 'NOT_FOUND'), 404);
});
inboxRoutes.post('/api/v1/inbox/:id/to-document', async (c) => {
  const scope = householdId(c.req.raw);
  const source = getInboxFile(scope, c.req.param('id'));
  const document = assignInboxToDocument(scope, c.req.param('id'), await readBody(c.req.raw, documentCreateInput));
  if (document && source) {
    relocateStoredFile('documents', scope, source.storedName);
    await runDocumentOcr(scope, document.id);
  }
  return document
    ? c.json({ data: document })
    : c.json(failure('Nie znaleziono pliku na liście Do przypisania.', 404, 'NOT_FOUND'), 404);
});
