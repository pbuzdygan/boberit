import { Hono } from 'hono';
import { listUserHouseholds } from '../db/accounts.js';
import { listWebhookDeliveries, listWebhooks, createWebhook, updateWebhook, deleteWebhook } from '../db/webhooks.js';
import { failure, json } from '../http.js';
import { webhookUrlError } from '../outbound.js';
import { encryptSecret } from '../secrets.js';
import { currentUser } from '../session.js';

export const webhooksRoutes = new Hono();
webhooksRoutes.get('/api/v1/settings/webhook-deliveries', (c) => {
  const user = currentUser(c.req.raw)!;
  return c.json({ data: listWebhookDeliveries(String(user.id)) });
});
webhooksRoutes.get('/api/v1/settings/webhooks', (c) => {
  const user = currentUser(c.req.raw)!;
  return c.json({
    data: listWebhooks(String(user.id)).map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      events: JSON.parse(String(row.events_json)),
      scopeAll: Number(row.scope_all) === 1,
      householdIds: JSON.parse(String(row.household_ids_json ?? '[]')),
      createdAt: row.created_at,
    })),
  });
});
webhooksRoutes.post('/api/v1/settings/webhooks', async (c) => {
  const input = await json<{ name: string; url: string; secret?: string; events: string[]; householdIds?: string[] }>(
    c.req.raw,
  );
  if (!input.name?.trim() || !Array.isArray(input.events) || !input.events.length)
    return c.json(failure('Podaj nazwę, adres HTTP(S) i co najmniej jedno zdarzenie.'), 400);
  const urlError = await webhookUrlError(input.url);
  if (urlError) return c.json(failure(urlError), 400);
  const user = currentUser(c.req.raw)!;
  const allowed = new Set(listUserHouseholds(String(user.id)).map((row) => String(row.id)));
  const householdIds = (input.householdIds ?? []).filter((id) => allowed.has(id));
  const hook = createWebhook({
    userId: String(user.id),
    name: input.name.trim(),
    url: input.url.trim(),
    secretEncrypted: encryptSecret(input.secret?.trim() ?? ''),
    events: input.events,
    householdIds,
  });
  return c.json({ data: hook }, 201);
});
webhooksRoutes.patch('/api/v1/settings/webhooks/:id', async (c) => {
  const input = await json<{ name: string; url: string; secret?: string; events: string[]; householdIds?: string[] }>(
    c.req.raw,
  );
  if (!input.name?.trim() || !Array.isArray(input.events) || !input.events.length)
    return c.json(failure('Podaj nazwę, adres HTTP(S) i co najmniej jedno zdarzenie.'), 400);
  const urlError = await webhookUrlError(input.url);
  if (urlError) return c.json(failure(urlError), 400);
  const user = currentUser(c.req.raw)!;
  const allowed = new Set(listUserHouseholds(String(user.id)).map((row) => String(row.id)));
  const householdIds = (input.householdIds ?? []).filter((id) => allowed.has(id));
  const secretEncrypted = input.secret?.trim() ? encryptSecret(input.secret.trim()) : undefined;
  return updateWebhook(String(user.id), c.req.param('id'), {
    name: input.name.trim(),
    url: input.url.trim(),
    secretEncrypted,
    events: input.events,
    householdIds,
  })
    ? c.json({ data: { updated: true } })
    : c.json(failure('Nie znaleziono webhooka.', 404, 'NOT_FOUND'), 404);
});
webhooksRoutes.delete('/api/v1/settings/webhooks/:id', (c) =>
  deleteWebhook(String(currentUser(c.req.raw)!.id), c.req.param('id'))
    ? c.body(null, 204)
    : c.json(failure('Nie znaleziono webhooka.', 404, 'NOT_FOUND'), 404),
);
