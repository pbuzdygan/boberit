import { Hono } from 'hono';
import { getAssetFile } from '../db/assets.js';
import { getDocumentFile } from '../db/documents.js';
import { getInboxFile } from '../db/inbox.js';
import { failure } from '../http.js';
import { householdId } from '../session.js';
import { readStoredFile, type StorageArea } from '../storage.js';
import { inlinePreviewTypes } from '../uploads.js';

export const filesRoutes = new Hono();
function locatedFile(scope: string, id: string) {
  const item = getAssetFile(scope, id);
  if (item) return { file: item, area: 'items' as StorageArea };
  const inbox = getInboxFile(scope, id);
  if (inbox) return { file: inbox, area: 'inbox' as StorageArea };
  const document = getDocumentFile(scope, id);
  if (document) return { file: document, area: 'documents' as StorageArea };
  return null;
}

filesRoutes.get('/api/v1/files/:id/download', (c) => {
  const scope = householdId(c.req.raw);
  const located = locatedFile(scope, c.req.param('id'));
  if (!located) return c.json(failure('Nie znaleziono pliku.', 404, 'NOT_FOUND'), 404);
  const { file } = located;
  return new Response(new Uint8Array(readStoredFile(located.area, scope, file.storedName)), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.byteSize),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
filesRoutes.get('/api/v1/files/:id/preview', (c) => {
  const scope = householdId(c.req.raw);
  const located = locatedFile(scope, c.req.param('id'));
  if (!located) return c.json(failure('Nie znaleziono pliku.', 404, 'NOT_FOUND'), 404);
  const { file } = located;
  const inline = inlinePreviewTypes.has(file.mimeType);
  return new Response(new Uint8Array(readStoredFile(located.area, scope, file.storedName)), {
    headers: {
      'Content-Type': inline ? file.mimeType : 'application/octet-stream',
      'Content-Length': String(file.byteSize),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
