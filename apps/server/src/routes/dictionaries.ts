import type { AssetOptionKind } from '@boberit/shared';
import { Hono } from 'hono';
import {
  createAssetOption,
  createDocumentType,
  deleteAssetOption,
  deleteDocumentType,
  listAssetOptions,
  listDocumentTypes,
  updateAssetOption,
  updateDocumentType,
} from '../db/dictionaries.js';
import { failure, isUniqueViolation, json } from '../http.js';
import { currentUser, householdId } from '../session.js';

export const dictionariesRoutes = new Hono();
dictionariesRoutes.get('/api/v1/household/asset-options', (c) =>
  c.json({ data: listAssetOptions(householdId(c.req.raw)) }),
);
dictionariesRoutes.post('/api/v1/household/asset-options', async (c) => {
  const user = currentUser(c.req.raw);
  if (!user || user.role !== 'owner')
    return c.json(failure('Tylko właściciel może dodawać kategorie i lokalizacje.', 403, 'FORBIDDEN'), 403);
  const input = await json<{ kind: AssetOptionKind; name: string }>(c.req.raw);
  if (input.kind !== 'category' && input.kind !== 'location')
    return c.json(failure('Nieprawidłowy typ słownika.'), 400);
  try {
    return c.json({ data: createAssetOption(String(user.household_id), input.kind, input.name ?? '') }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json(failure('Taka pozycja już istnieje.'), 400);
    throw error;
  }
});
dictionariesRoutes.patch('/api/v1/household/asset-options/:id', async (c) => {
  const user = currentUser(c.req.raw);
  if (!user || user.role !== 'owner')
    return c.json(failure('Tylko właściciel może zmieniać kategorie i lokalizacje.', 403, 'FORBIDDEN'), 403);
  const input = await json<{ name: string }>(c.req.raw);
  try {
    const option = updateAssetOption(String(user.household_id), c.req.param('id'), input.name ?? '');
    return option ? c.json({ data: option }) : c.json(failure('Nie znaleziono pozycji.', 404, 'NOT_FOUND'), 404);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json(failure('Taka pozycja już istnieje.'), 400);
    throw error;
  }
});
dictionariesRoutes.delete('/api/v1/household/asset-options/:id', (c) => {
  const user = currentUser(c.req.raw);
  if (!user || user.role !== 'owner')
    return c.json(failure('Tylko właściciel może usuwać kategorie i lokalizacje.', 403, 'FORBIDDEN'), 403);
  return deleteAssetOption(String(user.household_id), c.req.param('id'))
    ? c.body(null, 204)
    : c.json(failure('Nie znaleziono pozycji.', 404, 'NOT_FOUND'), 404);
});
dictionariesRoutes.get('/api/v1/household/document-types', (c) =>
  c.json({ data: listDocumentTypes(householdId(c.req.raw)) }),
);
dictionariesRoutes.post('/api/v1/household/document-types', async (c) => {
  const user = currentUser(c.req.raw);
  if (!user || user.role !== 'owner')
    return c.json(failure('Tylko właściciel może dodawać typy dokumentów.', 403, 'FORBIDDEN'), 403);
  const input = await json<{ name: string }>(c.req.raw);
  try {
    return c.json({ data: createDocumentType(String(user.household_id), input.name ?? '') }, 201);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json(failure('Taki typ dokumentu już istnieje.'), 400);
    throw error;
  }
});
dictionariesRoutes.patch('/api/v1/household/document-types/:id', async (c) => {
  const user = currentUser(c.req.raw);
  if (!user || user.role !== 'owner')
    return c.json(failure('Tylko właściciel może zmieniać typy dokumentów.', 403, 'FORBIDDEN'), 403);
  const input = await json<{ name: string }>(c.req.raw);
  try {
    const type = updateDocumentType(String(user.household_id), c.req.param('id'), input.name ?? '');
    return type ? c.json({ data: type }) : c.json(failure('Nie znaleziono typu.', 404, 'NOT_FOUND'), 404);
  } catch (error) {
    if (isUniqueViolation(error)) return c.json(failure('Taki typ dokumentu już istnieje.'), 400);
    throw error;
  }
});
dictionariesRoutes.delete('/api/v1/household/document-types/:id', (c) => {
  const user = currentUser(c.req.raw);
  if (!user || user.role !== 'owner')
    return c.json(failure('Tylko właściciel może usuwać typy dokumentów.', 403, 'FORBIDDEN'), 403);
  return deleteDocumentType(String(user.household_id), c.req.param('id'))
    ? c.body(null, 204)
    : c.json(failure('Nie znaleziono typu.', 404, 'NOT_FOUND'), 404);
});
