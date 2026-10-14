import type { AssetFileKind, CreateAssetInput, Warranty } from '@boberit/shared';
import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import {
  addAssetFile,
  classifyAssetFile,
  deleteAssetFile,
  createAsset,
  getAsset,
  listAssets,
  saveWarranty,
  updateAsset,
} from '../db/assets.js';
import { addAuditEvent } from '../db/audit.js';
import { moveAssetToTrash } from '../db/trash.js';
import { failure, json } from '../http.js';
import { notify } from '../notify.js';
import { currentUser, householdId } from '../session.js';
import { removeStoredFiles, writeStoredFile } from '../storage.js';
import { prepareUpload, validateUpload } from '../uploads.js';

export const assetsRoutes = new Hono();
assetsRoutes.get('/api/v1/assets', (c) => c.json({ data: listAssets(householdId(c.req.raw), c.req.query('q') ?? '') }));
assetsRoutes.get('/api/v1/assets/:id', (c) => {
  const asset = getAsset(householdId(c.req.raw), c.req.param('id'));
  return asset ? c.json({ data: asset }) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
assetsRoutes.post('/api/v1/assets', async (c) => {
  const input = await json<CreateAssetInput>(c.req.raw);
  const asset = createAsset(householdId(c.req.raw), input);
  addAuditEvent({
    householdId: householdId(c.req.raw),
    userId: String(currentUser(c.req.raw)!.id),
    action: 'created',
    entityKind: 'asset',
    entityId: asset.id,
    label: asset.name,
  });
  notify('asset.created', { id: asset.id, name: asset.name }, householdId(c.req.raw));
  return c.json({ data: asset }, 201);
});
assetsRoutes.patch('/api/v1/assets/:id', async (c) => {
  const asset = updateAsset(
    householdId(c.req.raw),
    c.req.param('id'),
    await json<Partial<CreateAssetInput>>(c.req.raw),
  );
  return asset ? c.json({ data: asset }) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
assetsRoutes.delete('/api/v1/assets/:id', (c) => {
  const scope = householdId(c.req.raw);
  const asset = getAsset(scope, c.req.param('id'));
  if (!moveAssetToTrash(scope, c.req.param('id')))
    return c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
  addAuditEvent({
    householdId: scope,
    userId: String(currentUser(c.req.raw)!.id),
    action: 'trashed',
    entityKind: 'asset',
    entityId: c.req.param('id'),
    label: asset?.name ?? '',
  });
  notify('asset.deleted', { id: c.req.param('id'), name: asset?.name }, scope);
  return c.body(null, 204);
});
assetsRoutes.put('/api/v1/assets/:id/warranty', async (c) => {
  const warranty = saveWarranty(householdId(c.req.raw), c.req.param('id'), await json<Warranty>(c.req.raw));
  return warranty ? c.json({ data: warranty }) : c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
});
assetsRoutes.post('/api/v1/assets/:id/files', async (c) => {
  const assetId = c.req.param('id');
  if (!getAsset(householdId(c.req.raw), assetId))
    return c.json(failure('Nie znaleziono przedmiotu.', 404, 'NOT_FOUND'), 404);
  const form = await c.req.raw.formData();
  const rawFile = form.get('file');
  if (!rawFile || typeof rawFile === 'string') throw new Error('Wybierz plik do dodania.');
  validateUpload(rawFile);
  const requestedKind = String(form.get('kind') ?? 'other');
  const kind: AssetFileKind = ['photo', 'receipt', 'manual', 'other'].includes(requestedKind)
    ? (requestedKind as AssetFileKind)
    : 'other';
  const upload = await prepareUpload(rawFile);
  const storedName = `${randomUUID()}${upload.extension}`;
  const scope = householdId(c.req.raw);
  writeStoredFile('items', scope, storedName, upload.data);
  const file = addAssetFile(scope, assetId, {
    kind,
    kindLocked: String(form.get('provisional') ?? '') !== 'true',
    originalName: upload.originalName,
    storedName,
    mimeType: upload.mimeType,
    byteSize: upload.byteSize,
  });
  return c.json({ data: file }, 201);
});
assetsRoutes.patch('/api/v1/assets/:id/files/:fileId', async (c) => {
  const input = await json<{ kind: AssetFileKind }>(c.req.raw);
  if (!['photo', 'receipt', 'manual', 'other'].includes(input.kind))
    return c.json(failure('Wybierz poprawny typ pliku.'), 400);
  const file = classifyAssetFile(householdId(c.req.raw), c.req.param('id'), c.req.param('fileId'), input.kind);
  return file
    ? c.json({ data: file })
    : c.json(failure('Typ tego pliku został już określony lub plik nie istnieje.', 409, 'ALREADY_CLASSIFIED'), 409);
});
assetsRoutes.delete('/api/v1/assets/:id/files/:fileId', (c) => {
  const scope = householdId(c.req.raw);
  const storedName = deleteAssetFile(scope, c.req.param('id'), c.req.param('fileId'));
  if (!storedName) return c.json(failure('Nie znaleziono załącznika przedmiotu.', 404, 'NOT_FOUND'), 404);
  removeStoredFiles([{ householdId: scope, storedName }]);
  return c.body(null, 204);
});
